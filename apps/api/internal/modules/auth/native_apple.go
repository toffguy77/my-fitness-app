package auth

import (
	"errors"
	"net/http"

	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Sign in with Apple из приложения (apple-sign-in).
//
// Тот же общий поток, что у Яндекса и VK, только профиль приходит не
// колбэком, а identity token'ом в теле: oauth.Apple проверяет его и меняет
// authorization_code на refresh-токен Apple, а дальше — ResolveProviderSignIn,
// согласия, подтверждение владения адресом, привязка и отвязка как у всех.
//
// Nonce выдаёт сервер (native/apple/nonce) и гасит первым входом
// (apple_nonce.go): identity token одноразовый сам по себе, а не только
// благодаря одноразовому коду.

// NativeAppleRequest — что приложение получило от AuthenticationServices.
type NativeAppleRequest struct {
	IdentityToken     string `json:"identity_token" binding:"required"`
	AuthorizationCode string `json:"authorization_code" binding:"required"`
	// Nonce — исходное значение, выданное native/apple/nonce; в запрос к
	// Apple приложение кладёт hex(SHA-256(nonce)) строчными буквами.
	Nonce string `json:"nonce" binding:"required"`
	// FullName Apple отдаёт приложению только при первой авторизации.
	FullName   *oauth.AppleName `json:"full_name"`
	DeviceName string           `json:"device_name"`
}

func (r NativeAppleRequest) credential() oauth.AppleCredential {
	return oauth.AppleCredential{
		IdentityToken:     r.IdentityToken,
		AuthorizationCode: r.AuthorizationCode,
		Nonce:             r.Nonce,
		FullName:          r.FullName,
	}
}

// NativeAppleNonceResponse is the nonce for the next Apple sign-in.
type NativeAppleNonceResponse struct {
	Nonce     string `json:"nonce"`
	ExpiresIn int    `json:"expires_in"`
}

// NativeAppleNonce handles POST /api/v1/auth/native/apple/nonce.
//
// 200 {nonce, expires_in}: a one-time nonce for native/apple or
// native/apple/link, valid for AppleNonceTTL. 503 feature_unavailable when
// Apple is not configured.
func (h *OAuthHandler) NativeAppleNonce(c *gin.Context) {
	if h.apple == nil {
		response.Fail(c, http.StatusServiceUnavailable, apperrors.ErrFeatureUnavailable,
			"Вход через Apple недоступен")
		return
	}
	nonce, err := h.service.IssueAppleNonce(c.Request.Context())
	if err != nil {
		h.log.Error("Failed to issue an Apple nonce", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось начать вход через Apple")
		return
	}
	response.Success(c, http.StatusOK, NativeAppleNonceResponse{
		Nonce: nonce, ExpiresIn: int(AppleNonceTTL.Seconds()),
	})
}

// failApple answers for a failure of the Apple adapter.
func (h *OAuthHandler) failApple(c *gin.Context, err error) {
	switch {
	case errors.Is(err, oauth.ErrIdentityRejected), errors.Is(err, apperrors.ErrTokenInvalid):
		h.log.Warn("Apple identity rejected", "error", err)
		response.Fail(c, http.StatusUnauthorized, apperrors.ErrTokenInvalid,
			"Apple не подтвердила вход. Попробуйте ещё раз.")
	case errors.Is(err, oauth.ErrAppleUnavailable):
		h.log.Warn("Apple is unavailable", "error", err)
		response.ErrorCode(c, http.StatusServiceUnavailable, apperrors.CodeAppleUnavailable,
			"Apple сейчас не отвечает. Попробуйте войти чуть позже.", nil)
	default:
		h.log.Error("Sign in with Apple failed", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось войти через Apple")
	}
}

// appleRequest binds the request, verifies the identity token and spends the
// server-issued nonce it carries, answering for every failure. The
// authorization code is not exchanged yet.
func (h *OAuthHandler) appleRequest(c *gin.Context) (*oauth.Profile, NativeAppleRequest, bool) {
	var req NativeAppleRequest
	if h.apple == nil {
		response.Fail(c, http.StatusServiceUnavailable, apperrors.ErrFeatureUnavailable,
			"Вход через Apple недоступен")
		return nil, req, false
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation,
			"Нужны identity_token, authorization_code и nonce")
		return nil, req, false
	}
	ctx := c.Request.Context()
	profile, err := h.apple.Identify(ctx, req.credential())
	if err != nil {
		h.failApple(c, err)
		return nil, req, false
	}
	// После проверки подписи: чужой мусор не гасит выданные nonce. Токен
	// несёт хэш именно этого nonce — это Identify уже проверил.
	if err := h.service.ConsumeAppleNonce(ctx, req.Nonce); err != nil {
		h.failApple(c, err)
		return nil, req, false
	}
	return profile, req, true
}

// appleProfile verifies the request and exchanges the authorization code for
// Apple's refresh token, which account deletion revokes.
//
// A code Apple refuses is a refusal of the sign-in: 401, whoever asks. Only
// when Apple does not answer at all, and only for an Apple ID linked to an
// account that already holds a token (allowStored), does the sign-in go on
// without a fresh one: the identity token is verified and its nonce spent,
// and the token deletion needs is already there. Everyone else gets 503
// apple_unavailable.
func (h *OAuthHandler) appleProfile(c *gin.Context, allowStored bool) (*oauth.Profile, NativeAppleRequest, bool) {
	profile, req, ok := h.appleRequest(c)
	if !ok {
		return nil, req, false
	}
	ctx := c.Request.Context()
	sealed, err := h.apple.ExchangeCode(ctx, req.AuthorizationCode)
	if err == nil {
		profile.SealedRefreshToken = sealed
		return profile, req, true
	}
	if allowStored && errors.Is(err, oauth.ErrAppleUnavailable) {
		holds, herr := h.service.HoldsProviderToken(ctx, "apple", profile.ProviderUserID)
		if herr != nil {
			h.failApple(c, herr)
			return nil, req, false
		}
		if holds {
			h.log.Warn("Apple unavailable; signing a linked Apple ID in with its stored token", "error", err)
			return profile, req, true
		}
	}
	h.failApple(c, err)
	return nil, req, false
}

// NativeApple handles POST /api/v1/auth/native/apple.
//
// 200 with the native pair and status signed_in for an Apple ID linked to an
// account (found by sub, whatever address the token now carries); otherwise
// 200 {status, pending_token}: needs_consents for a new person (no account
// is created until native/consents), needs_link_confirmation when the
// address belongs to an existing account (native/oauth/link with its
// password), needs_email when Apple gave no verified address. 401
// token_invalid for a token or code Apple does not vouch for, or a nonce the
// server did not issue, already spent or expired; 503 apple_unavailable when
// Apple does not answer and the exchange is needed (anyone but a linked
// Apple ID that already holds a token); 503
// feature_unavailable when Apple is not configured.
func (h *OAuthHandler) NativeApple(c *gin.Context) {
	profile, req, ok := h.appleProfile(c, true)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	const provider = "apple"

	outcome, err := h.service.ResolveProviderSignIn(ctx, provider, profile)
	if err != nil {
		h.log.Error("Sign in with Apple failed", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось войти через Apple")
		return
	}

	if outcome.Result == OAuthSignedIn {
		signedIn, err := h.service.SignInLinkedFor(ctx, NativeSession(req.DeviceName), provider, profile,
			outcome.UserID, c.ClientIP(), c.Request.UserAgent())
		if err != nil {
			h.log.Error("Failed to issue a session after Sign in with Apple", "error", err)
			response.Fail(c, http.StatusInternalServerError, err, "Не удалось войти через Apple")
			return
		}
		h.recordOutcomeFor(ctx, signedIn, provider, ClientIOS)
		body := nativeSessionBody(signedIn.User)
		body.Status = string(HandoffSignedIn)
		response.Success(c, http.StatusOK, body)
		return
	}

	result, err := h.service.handoffResultFor(ctx, provider, profile, outcome)
	if err != nil {
		h.log.Error("Failed to park Sign in with Apple", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось войти через Apple")
		return
	}
	response.Success(c, http.StatusOK, NativePendingResponse{
		Status:       result.Status,
		PendingToken: result.PendingToken,
		Provider:     provider,
		Email:        result.Email,
	})
}

// NativeAppleLink handles POST /api/v1/auth/native/apple/link.
//
// Attaches the caller's Apple ID to the signed-in account («Способы входа» in
// the app). 200 {linked: true}; 409 conflict when that Apple ID belongs to
// another account; 503 apple_unavailable when Apple does not answer the code
// exchange. Unlinking is the shared DELETE /auth/providers/apple,
// which refuses the last way in with 409 provider_only_way_in and revokes the
// token at Apple.
func (h *OAuthHandler) NativeAppleLink(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		response.Fail(c, http.StatusUnauthorized, apperrors.ErrUnauthorized, "Требуется авторизация")
		return
	}
	// Привязка всегда меняет код: токен нужен отзыву при удалении аккаунта.
	profile, _, ok := h.appleProfile(c, false)
	if !ok {
		return
	}
	err := h.service.LinkProvider(c.Request.Context(), userID.(int64), "apple", profile)
	switch {
	case err == nil:
		response.Success(c, http.StatusOK, gin.H{"linked": true, "provider": "apple"})
	case errors.Is(err, apperrors.ErrConflict):
		response.ErrorCode(c, http.StatusConflict, apperrors.CodeConflict,
			"Этот Apple ID уже привязан к другому аккаунту", nil)
	default:
		h.log.Error("Failed to link Apple", "error", err)
		response.Fail(c, http.StatusInternalServerError, err, "Не удалось привязать Apple")
	}
}
