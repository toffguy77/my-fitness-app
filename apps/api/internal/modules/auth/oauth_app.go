package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Вход через Яндекс или VK из iOS-приложения.
//
// Сайт получает сессию HttpOnly-cookie в браузере. Приложение открывает вход в
// ASWebAuthenticationSession, и cookie остаётся в её хранилище, недоступном
// приложению. Поэтому для приложения обратный вызов отдаёт не cookie, а
// одноразовый код на две минуты переходом на https://<домен>/auth/app-complete.
// Код обменивается на сессию вместе с секретом, хэш которого приложение
// прислало в начале (как PKCE).
//
// Возврат — на https нашего домена, а не на собственную схему burcev://.
// Начать поток со своим хэшем может кто угодно: прислать жертве ссылку, и после
// её входа код ушёл бы на burcev://, а эту схему вправе зарегистрировать любое
// приложение на телефоне — и злоумышленник с его секретом получил бы сессию
// жертвы. https-адрес система отдаёт только приложению, чей домен подтверждён
// (associated-domains), а в браузере код остаётся на нашей пустой странице.

const (
	// appChallengeCookie несёт хэш секрета приложения через поток входа.
	appChallengeCookie = "oauth_app"
	// AppCallbackPath — куда на нашем домене возвращается вход, начатый из
	// приложения. Страница пустая, без скриптов и счётчиков.
	AppCallbackPath = "/auth/app-complete"
	appHandoffTTL   = 2 * time.Minute
)

// base64url без дополнения от SHA-256 — 43 символа.
var appChallengePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

// appChallenge — хэш секрета приложения, если вход начат из приложения.
func appChallenge(c *gin.Context) string {
	value, _ := c.Cookie(appChallengeCookie)
	if appChallengePattern.MatchString(value) {
		return value
	}
	return ""
}

// redirectToAppClient возвращает вход в приложение с причиной отказа.
// Привязка к существующему аккаунту и ввод почты живут в браузерной сессии,
// приложению их не довести — оно предлагает войти по ссылке или паролю.
func redirectToAppClient(c *gin.Context, origin, path string) {
	reason := "failed"
	switch {
	case strings.HasPrefix(path, "/auth/link"):
		reason = "link_required"
	case strings.HasPrefix(path, "/auth/email"):
		reason = "email_required"
	default:
		if parsed, err := url.Parse(path); err == nil && parsed.Query().Get("oauth") != "" {
			reason = parsed.Query().Get("oauth")
		}
	}
	c.Redirect(http.StatusFound, origin+AppCallbackPath+"?"+url.Values{"error": {reason}}.Encode())
}

// handoffToApp отдаёт приложению одноразовый код вместо cookie.
func (h *OAuthHandler) handoffToApp(c *gin.Context, outcome *OAuthOutcome, challenge string) {
	// Сессия, выпущенная обратным вызовом, приложению не достаётся: её место
	// займёт выданная при обмене кода.
	if err := h.service.RevokeRefreshToken(c.Request.Context(), outcome.User.RefreshToken); err != nil {
		h.log.Warn("Failed to revoke the browser-side session of an app sign-in", "error", err)
	}
	code, err := h.service.CreateAppHandoff(c.Request.Context(), outcome.User.User.ID, challenge)
	if err != nil {
		h.log.Error("Failed to create app sign-in handoff", "error", err)
		redirectToAppClient(c, h.appOrigin(), "/auth?oauth=failed")
		return
	}
	c.Redirect(http.StatusFound, h.appOrigin()+AppCallbackPath+"?"+url.Values{
		"code":   {code},
		"result": {string(outcome.Result)},
	}.Encode())
}

// AppExchangeRequest — обмен кода на сессию.
type AppExchangeRequest struct {
	Code     string `json:"code" binding:"required"`
	Verifier string `json:"verifier" binding:"required"`
}

// AppExchange handles POST /api/v1/auth/oauth/app-exchange.
func (h *OAuthHandler) AppExchange(c *gin.Context) {
	var req AppExchangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}
	result, err := h.service.ExchangeAppHandoff(c.Request.Context(), req.Code, req.Verifier, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		if errors.Is(err, apperrors.ErrUnauthorized) {
			response.ErrorCode(c, http.StatusUnauthorized, apperrors.CodeUnauthorized,
				"Код входа устарел или уже использован. Попробуйте ещё раз.", nil)
			return
		}
		h.log.Error("App sign-in exchange failed", "error", err)
		response.InternalError(c, "Не удалось завершить вход")
		return
	}
	// Как вход с паролем и «запомнить меня»: приложение забирает refresh-токен
	// из Set-Cookie.
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(refreshCookieName, result.RefreshToken, int(rememberMeLifetime.Seconds()), "/api/v1/auth", "", true, true)
	response.Success(c, http.StatusOK, result)
}

func hashHandoff(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// CreateAppHandoff выдаёт одноразовый код для приложения.
func (s *Service) CreateAppHandoff(ctx context.Context, userID int64, challenge string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	code := base64.RawURLEncoding.EncodeToString(raw)
	// Просроченные убираем здесь же: строк единицы, отдельная задача не нужна.
	if _, err := s.db.ExecContext(ctx, `DELETE FROM oauth_app_handoffs WHERE expires_at < NOW()`); err != nil {
		return "", fmt.Errorf("purge app handoffs: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO oauth_app_handoffs (code_hash, user_id, challenge, expires_at) VALUES ($1, $2, $3, $4)`,
		hashHandoff(code), userID, challenge, time.Now().Add(appHandoffTTL)); err != nil {
		return "", fmt.Errorf("store app handoff: %w", err)
	}
	return code, nil
}

// ExchangeAppHandoff меняет код и секрет на сессию. Код одноразовый: строка
// удаляется в той же операции, что читается.
func (s *Service) ExchangeAppHandoff(ctx context.Context, code, verifier, ip, ua string) (*LoginResult, error) {
	var userID int64
	var challenge string
	err := s.db.QueryRowContext(ctx,
		`DELETE FROM oauth_app_handoffs WHERE code_hash = $1 AND expires_at >= NOW()
		 RETURNING user_id, challenge`, hashHandoff(code)).Scan(&userID, &challenge)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("unknown or expired app handoff: %w", apperrors.ErrUnauthorized)
	}
	if err != nil {
		return nil, fmt.Errorf("load app handoff: %w", err)
	}
	if subtle.ConstantTimeCompare([]byte(hashHandoff(verifier)), []byte(challenge)) != 1 {
		return nil, fmt.Errorf("app handoff verifier mismatch: %w", apperrors.ErrUnauthorized)
	}
	return s.issueTokensForUser(ctx, userID, ip, ua)
}
