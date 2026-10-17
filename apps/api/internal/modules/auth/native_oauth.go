package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Вход через Яндекс или VK из iOS-приложения (native-oauth-handoff).
//
// Приложение открывает GET /auth/oauth/:provider?client=ios&app_challenge=<S256>
// в ASWebAuthenticationSession. Колбэк, как у сайта, проверяет state и PKCE
// провайдера, но сессию не выпускает: он сохраняет результат входа под
// одноразовым кодом на 60 секунд и уводит на
// https://<домен>/auth/native-complete?code=…. Этот https-адрес система отдаёт
// только приложению, чей домен подтверждён apple-app-site-association, а код
// без verifier, хэш которого приложение прислало в начале, ничего не стоит.
// Приложение меняет код на сессию в POST /auth/native/oauth/exchange.
//
// Свою схему vzvesheno:// не используем: её вправе зарегистрировать любое
// приложение на телефоне. Сессию прямо в адресе колбэка не отдаём: адрес
// остаётся в истории и журналах прокси.

const (
	// nativeChallengeCookie несёт PKCE-вызов приложения через поход к
	// провайдеру — рядом со state, в том же хранилище
	// ASWebAuthenticationSession.
	nativeChallengeCookie = "oauth_native_challenge"
	// NativeCompletePath — куда на нашем домене возвращается вход, начатый
	// из приложения (universal link). Без приложения там страница «Откройте
	// приложение Взвешено».
	NativeCompletePath = "/auth/native-complete"
	// HandoffCodeTTL — сколько живёт код передачи входа.
	HandoffCodeTTL = 60 * time.Second
)

// base64url без дополнения от SHA-256 — 43 символа.
var appChallengePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

// nativeChallenge — PKCE-вызов приложения, если поток начат из приложения.
func nativeChallenge(c *gin.Context) string {
	value, _ := c.Cookie(nativeChallengeCookie)
	if appChallengePattern.MatchString(value) {
		return value
	}
	return ""
}

// redirectToNativeFailure возвращает в приложение отказ с причиной:
// cancelled, unavailable, invalid_state, failed.
func (h *OAuthHandler) redirectToNativeFailure(c *gin.Context, path string) {
	reason := "failed"
	if parsed, err := url.Parse(path); err == nil && parsed.Query().Get("oauth") != "" {
		reason = parsed.Query().Get("oauth")
	}
	c.Redirect(http.StatusFound, h.appOrigin()+NativeCompletePath+"?"+url.Values{"error": {reason}}.Encode())
}

// HandoffStatus is what a provider sign-in led to, as the app sees it.
type HandoffStatus string

const (
	HandoffSignedIn              HandoffStatus = "signed_in"
	HandoffNeedsEmail            HandoffStatus = "needs_email"
	HandoffNeedsLinkConfirmation HandoffStatus = "needs_link_confirmation"
	HandoffNeedsConsents         HandoffStatus = "needs_consents"
)

// HandoffResult is stored in oauth_handoff_codes.result.
//
// A finished sign-in carries no token: the session is minted at the exchange,
// for the app, so the callback never holds one it would have to discard. The
// account is in the user_id column, not here — deleting the account finds the
// code by it.
type HandoffResult struct {
	Status   HandoffStatus `json:"status"`
	Provider string        `json:"provider"`
	// PendingToken identifies the parked attempt (oauth_pending_links.id)
	// when the sign-in is not finished.
	PendingToken string `json:"pending_token,omitempty"`
	// Email names the account to be claimed, for needs_link_confirmation.
	Email string `json:"email,omitempty"`
	// UserID is filled from the column on exchange.
	UserID int64 `json:"-"`
}

// handOffToApp finishes the callback of a sign-in the app started.
func (h *OAuthHandler) handOffToApp(c *gin.Context, provider string, profile *oauth.Profile, challenge string) {
	ctx := c.Request.Context()
	outcome, err := h.service.ResolveProviderSignIn(ctx, provider, profile)
	if err != nil {
		h.log.Error("External sign-in for the app failed", "error", err, "provider", provider)
		h.redirectToNativeFailure(c, "/auth?oauth=failed")
		return
	}

	result, err := h.service.handoffResultFor(ctx, provider, profile, outcome)
	if err != nil {
		h.log.Error("Failed to park the app's external sign-in", "error", err, "provider", provider)
		h.redirectToNativeFailure(c, "/auth?oauth=failed")
		return
	}

	code, err := h.service.CreateHandoffCode(ctx, challenge, result)
	if err != nil {
		h.log.Error("Failed to create the app's sign-in code", "error", err, "provider", provider)
		h.redirectToNativeFailure(c, "/auth?oauth=failed")
		return
	}
	c.Redirect(http.StatusFound, h.appOrigin()+NativeCompletePath+"?"+url.Values{"code": {code}}.Encode())
}

// handoffResultFor turns an outcome into what the app will receive, parking
// the attempt when it is not finished. The pending id is the app's
// pending_token: the browser carries the same id in the oauth_pending cookie.
func (s *Service) handoffResultFor(ctx context.Context, provider string, profile *oauth.Profile, outcome *OAuthOutcome) (HandoffResult, error) {
	result := HandoffResult{Provider: provider}
	switch outcome.Result {
	case OAuthSignedIn:
		result.Status = HandoffSignedIn
		result.UserID = outcome.UserID
		s.touchIdentity(ctx, provider, profile, outcome.UserID)
		return result, nil
	case OAuthNeedsEmail:
		result.Status = HandoffNeedsEmail
	case OAuthNeedsLinkConfirmation:
		result.Status = HandoffNeedsLinkConfirmation
		result.Email = outcome.Email
	case OAuthNeedsConsents:
		result.Status = HandoffNeedsConsents
	default:
		return result, fmt.Errorf("unexpected sign-in outcome %q", outcome.Result)
	}
	id, err := s.storePendingLink(ctx, provider, profile)
	if err != nil {
		return result, err
	}
	result.PendingToken = id
	return result, nil
}

func hashHandoff(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// CreateHandoffCode stores a result under a fresh one-time code and returns
// the code. 32 random bytes; only the hash is kept.
func (s *Service) CreateHandoffCode(ctx context.Context, challenge string, result HandoffResult) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	code := base64.RawURLEncoding.EncodeToString(raw)
	payload, err := json.Marshal(result)
	if err != nil {
		return "", fmt.Errorf("encode handoff result: %w", err)
	}
	// Old rows go here: a handful a day, a separate job would be ceremony.
	// An hour past expiry, so a code just expired still answers as expired
	// rather than unknown — both are token_invalid anyway.
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM oauth_handoff_codes WHERE expires_at < NOW() - INTERVAL '1 hour'`); err != nil {
		return "", fmt.Errorf("purge handoff codes: %w", err)
	}
	var userID any
	if result.UserID != 0 {
		userID = result.UserID
	}
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO oauth_handoff_codes (code_hash, app_challenge, user_id, result, expires_at)
		VALUES ($1, $2, $3, $4::jsonb, $5)`,
		hashHandoff(code), challenge, userID, payload, s.clock().Add(HandoffCodeTTL)); err != nil {
		return "", fmt.Errorf("store handoff code: %w", err)
	}
	return code, nil
}

// ExchangeHandoffCode spends a code. The first presentation burns it whatever
// the verifier: a code intercepted on its way to the app gets one guess, and
// that guess also ends the owner's — they start again, the thief gets nothing.
// Unknown, spent, expired and mismatched all fail with ErrTokenInvalid.
func (s *Service) ExchangeHandoffCode(ctx context.Context, code, verifier string) (HandoffResult, error) {
	var result HandoffResult
	var challenge string
	var userID sql.NullInt64
	var payload []byte
	var expiresAt time.Time
	err := s.db.QueryRowContext(ctx, `
		UPDATE oauth_handoff_codes SET used_at = NOW()
		 WHERE code_hash = $1 AND used_at IS NULL
		 RETURNING app_challenge, user_id, result, expires_at`, hashHandoff(code)).
		Scan(&challenge, &userID, &payload, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return result, fmt.Errorf("unknown or spent handoff code: %w", apperrors.ErrTokenInvalid)
	}
	if err != nil {
		return result, fmt.Errorf("spend handoff code: %w", err)
	}
	if !s.clock().Before(expiresAt) {
		return result, fmt.Errorf("handoff code expired: %w", apperrors.ErrTokenInvalid)
	}
	if subtle.ConstantTimeCompare([]byte(hashHandoff(verifier)), []byte(challenge)) != 1 {
		return result, fmt.Errorf("handoff verifier mismatch: %w", apperrors.ErrTokenInvalid)
	}
	if err := json.Unmarshal(payload, &result); err != nil {
		return result, fmt.Errorf("decode handoff result: %w", err)
	}
	result.UserID = userID.Int64
	if result.Status == HandoffSignedIn && result.UserID == 0 {
		// The account was deleted in the minute since: its code went with it
		// (ON DELETE CASCADE) or its id with the erasure.
		return result, fmt.Errorf("handoff leads to no account: %w", apperrors.ErrTokenInvalid)
	}
	return result, nil
}

// NativePendingResponse is a provider sign-in the app has to continue.
type NativePendingResponse struct {
	Status       HandoffStatus `json:"status"`
	PendingToken string        `json:"pending_token"`
	Provider     string        `json:"provider,omitempty"`
	// Email names the account to confirm, for needs_link_confirmation.
	Email string `json:"email,omitempty"`
}

// NativeOAuthExchangeRequest — обмен кода из universal link.
type NativeOAuthExchangeRequest struct {
	Code         string `json:"code" binding:"required"`
	CodeVerifier string `json:"code_verifier" binding:"required"`
	DeviceName   string `json:"device_name"`
}

// NativeOAuthExchange handles POST /api/v1/auth/native/oauth/exchange.
//
// 200 with the native pair and status signed_in; or 200 with
// {status, pending_token} for a sign-in still to be continued. 401
// token_invalid for a code that is unknown, spent, older than 60 seconds or
// presented with the wrong verifier.
func (h *OAuthHandler) NativeOAuthExchange(c *gin.Context) {
	var req NativeOAuthExchangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Нужны code и code_verifier")
		return
	}

	ctx := c.Request.Context()
	result, err := h.service.ExchangeHandoffCode(ctx, req.Code, req.CodeVerifier)
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrTokenInvalid):
		response.Fail(c, http.StatusUnauthorized, err, "Код входа устарел или уже использован. Попробуйте ещё раз.")
		return
	default:
		h.log.Error("Native sign-in code exchange failed", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось завершить вход")
		return
	}

	if result.Status != HandoffSignedIn {
		response.Success(c, http.StatusOK, NativePendingResponse{
			Status:       result.Status,
			PendingToken: result.PendingToken,
			Provider:     result.Provider,
			Email:        result.Email,
		})
		return
	}

	session, err := h.service.issueTokens(ctx, NativeSession(req.DeviceName), result.UserID,
		c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		h.log.Error("Failed to issue the app's session after a provider sign-in", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось завершить вход")
		return
	}
	h.recordOutcome(ctx, &OAuthOutcome{Result: OAuthSignedIn, User: session}, result.Provider)
	body := nativeSessionBody(session)
	body.Status = string(HandoffSignedIn)
	response.Success(c, http.StatusOK, body)
}

// NativeOAuthEmailRequest — адрес, которого провайдер не отдал.
type NativeOAuthEmailRequest struct {
	PendingToken string `json:"pending_token" binding:"required"`
	Email        string `json:"email" binding:"required,email"`
}

// NativeOAuthEmail handles POST /api/v1/auth/native/oauth/email.
//
// Like the site's step it issues no session: the typed address is unproved,
// so it leads either to the ownership proof (needs_link_confirmation) or to
// the consents (needs_consents), with the same pending_token.
func (h *OAuthHandler) NativeOAuthEmail(c *gin.Context) {
	var req NativeOAuthEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Укажите корректный адрес почты")
		return
	}

	outcome, err := h.service.CompleteWithEmail(c.Request.Context(), req.PendingToken,
		strings.ToLower(strings.TrimSpace(req.Email)), c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrTokenInvalid):
		response.Fail(c, http.StatusBadRequest, err, "Попытка входа истекла. Начните заново.")
		return
	default:
		h.log.Error("Failed to complete the app's sign-in with an address", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось завершить вход")
		return
	}

	status := HandoffNeedsConsents
	if outcome.Result == OAuthNeedsLinkConfirmation {
		status = HandoffNeedsLinkConfirmation
	}
	response.Success(c, http.StatusOK, NativePendingResponse{
		Status:       status,
		PendingToken: req.PendingToken,
		Provider:     outcome.Provider,
		Email:        outcome.Email,
	})
}

// NativeOAuthLinkRequest — подтверждение владения аккаунтом паролем.
type NativeOAuthLinkRequest struct {
	PendingToken string `json:"pending_token" binding:"required"`
	Password     string `json:"password" binding:"required"`
	DeviceName   string `json:"device_name"`
}

// NativeOAuthLink handles POST /api/v1/auth/native/oauth/link.
//
// The address the provider (or Apple) reported belongs to an account here;
// its password proves the account is the caller's, the provider is attached
// to it, and the app gets a native pair.
func (h *OAuthHandler) NativeOAuthLink(c *gin.Context) {
	var req NativeOAuthLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Нужны pending_token и пароль")
		return
	}

	result, err := h.service.ConfirmLinkWithPasswordFor(c.Request.Context(), NativeSession(req.DeviceName),
		req.PendingToken, req.Password, c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrInvalidCredentials):
		response.ErrorCode(c, http.StatusUnauthorized, apperrors.CodePasswordIncorrect, "Неверный пароль", nil)
		return
	case errors.Is(err, apperrors.ErrTokenInvalid):
		response.Fail(c, http.StatusBadRequest, err, "Попытка входа истекла. Начните заново.")
		return
	case errors.Is(err, apperrors.ErrConflict):
		response.ErrorCode(c, http.StatusConflict, apperrors.CodePasswordNotSet,
			"У этого аккаунта нет пароля. Войдите через сервис, который к нему уже привязан.", nil)
		return
	default:
		h.log.Error("Failed to confirm the app's external link", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось привязать аккаунт")
		return
	}

	h.recordOutcome(c.Request.Context(), &OAuthOutcome{Result: OAuthSignedIn, User: result}, "link")
	body := nativeSessionBody(result)
	body.Status = string(HandoffSignedIn)
	response.Success(c, http.StatusOK, body)
}

// NativeConsentsRequest — согласия до создания аккаунта.
type NativeConsentsRequest struct {
	PendingToken string         `json:"pending_token" binding:"required"`
	Consents     *ConsentsInput `json:"consents"`
	DeviceName   string         `json:"device_name"`
	// LeadToken carries the guest's onboarding answers onto the new account,
	// as the lead cookie does for the site: the app has no such cookie.
	LeadToken string `json:"lead_token"`
}

// NativeConsents handles POST /api/v1/auth/native/consents.
//
// The step every provider shares — Apple, Yandex, VK — when signing in would
// create an account: the same CompleteWithConsents the site's consents screen
// calls, with the attempt named by pending_token in the body.
//
// 200 with the native pair and created=true for a new account (or
// created=false for an account created before consents were asked for);
// 200 {status: needs_link_confirmation, pending_token} when the address has
// meanwhile become an account's; 400 consents_required without the mandatory
// consents (nothing is written); 400 token_invalid for a gone attempt.
func (h *OAuthHandler) NativeConsents(c *gin.Context) {
	var req NativeConsentsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation, "Нужен pending_token")
		return
	}
	if !consentsComplete(req.Consents) {
		response.ErrorCode(c, http.StatusBadRequest, apperrors.CodeConsentsRequired,
			"Нужно согласие на условия, политику конфиденциальности и обработку данных", nil)
		return
	}

	outcome, err := h.service.CompleteWithConsentsFor(c.Request.Context(), NativeSession(req.DeviceName),
		req.PendingToken, req.Consents, c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrValidation):
		response.ErrorCode(c, http.StatusBadRequest, apperrors.CodeConsentsRequired,
			"Нужно согласие на условия, политику конфиденциальности и обработку данных", nil)
		return
	case errors.Is(err, apperrors.ErrTokenInvalid):
		response.Fail(c, http.StatusBadRequest, err, "Попытка входа истекла. Начните заново.")
		return
	case errors.Is(err, apperrors.ErrConflict):
		response.ErrorCode(c, http.StatusConflict, apperrors.CodeConflict,
			"Этот адрес уже зарегистрирован. Войдите заново.", nil)
		return
	default:
		h.log.Error("Failed to complete the app's sign-in with consents", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось завершить вход")
		return
	}

	if outcome.Result == OAuthNeedsLinkConfirmation {
		response.Success(c, http.StatusOK, NativePendingResponse{
			Status:       HandoffNeedsLinkConfirmation,
			PendingToken: req.PendingToken,
			Provider:     outcome.Provider,
			Email:        outcome.Email,
		})
		return
	}

	created := outcome.Result == OAuthRegistered
	if created {
		carryArrival(c, h.leads, h.log, outcome.User.User.ID, req.LeadToken)
	}
	h.recordOutcome(c.Request.Context(), outcome, outcome.Provider)

	body := nativeSessionBody(outcome.User)
	body.Status = string(outcome.Result)
	body.Created = &created
	response.Success(c, http.StatusOK, body)
}

// PendingLinkAccountKeyFromCookie and PendingLinkAccountKeyFromBody are the
// rate-limit keys of the account a password confirmation is aimed at: the
// address on the parked attempt. The same key as the account's sign-ins
// (middleware.ByEmail), so wrong passwords typed here count against the same
// login-account allowance.
//
// Two functions, each reading exactly where its handler reads the attempt
// from: the site's /auth/oauth/link takes the oauth_pending cookie, the app's
// native/oauth/link the pending_token in the body. A key read from anywhere
// else would let a request charge one account's allowance while guessing
// another's password.
func (h *OAuthHandler) PendingLinkAccountKeyFromCookie(c *gin.Context) string {
	pending, _ := c.Cookie(pendingCookie)
	return middleware.AccountKey(c, h.service.PendingLinkEmail(c.Request.Context(), pending))
}

// PendingLinkAccountKeyFromBody: see PendingLinkAccountKeyFromCookie.
func (h *OAuthHandler) PendingLinkAccountKeyFromBody(c *gin.Context) string {
	var body struct {
		PendingToken string `json:"pending_token"`
	}
	middleware.PeekJSON(c, &body)
	return middleware.AccountKey(c, h.service.PendingLinkEmail(c.Request.Context(), body.PendingToken))
}
