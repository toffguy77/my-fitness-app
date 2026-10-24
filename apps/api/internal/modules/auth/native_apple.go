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

// NativeAppleRequest — что приложение получило от AuthenticationServices.
type NativeAppleRequest struct {
	IdentityToken string `json:"identity_token" binding:"required"`
	// AuthorizationCode меняется на refresh-токен Apple. Обязателен для
	// нового аккаунта и привязки; для привязанного Apple ID с сохранённым
	// токеном — нет (apple-sign-in, «Apple недоступна»).
	AuthorizationCode string `json:"authorization_code"`
	// Nonce — исходное значение; в запрос к Apple приложение кладёт
	// hex(SHA-256(nonce)) строчными буквами.
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

// failApple answers for a failure of the Apple adapter.
func (h *OAuthHandler) failApple(c *gin.Context, err error) {
	switch {
	case errors.Is(err, oauth.ErrIdentityRejected):
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

// appleRequest binds the request and verifies the identity token, answering
// for every failure. The authorization code is not exchanged yet.
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
	profile, err := h.apple.Identify(c.Request.Context(), req.credential())
	if err != nil {
		h.failApple(c, err)
		return nil, req, false
	}
	return profile, req, true
}

// exchangeAppleCode puts Apple's refresh token into the profile; the account
// about to be created or linked must hold one, since deleting it revokes the
// token at Apple. Answers for every failure.
func (h *OAuthHandler) exchangeAppleCode(c *gin.Context, profile *oauth.Profile, code string) bool {
	if code == "" {
		response.Fail(c, http.StatusBadRequest, apperrors.ErrValidation,
			"Нужны identity_token, authorization_code и nonce")
		return false
	}
	sealed, err := h.apple.ExchangeCode(c.Request.Context(), code)
	if err != nil {
		h.failApple(c, err)
		return false
	}
	profile.SealedRefreshToken = sealed
	return true
}

// appleProfile verifies the request and secures Apple's refresh token.
//
// An Apple ID already linked to an account that holds a token signs in
// without the exchange: the token deletion needs is there, and Apple's token
// endpoint being down must not lock the person out. A code that came along
// is still exchanged, best effort — success replaces the stored token,
// failure is logged and changes nothing. Everyone else needs the exchange.
func (h *OAuthHandler) appleProfile(c *gin.Context) (*oauth.Profile, NativeAppleRequest, bool) {
	profile, req, ok := h.appleRequest(c)
	if !ok {
		return nil, req, false
	}
	ctx := c.Request.Context()
	holds, err := h.service.HoldsProviderToken(ctx, "apple", profile.ProviderUserID)
	if err != nil {
		h.failApple(c, err)
		return nil, req, false
	}
	if !holds {
		return profile, req, h.exchangeAppleCode(c, profile, req.AuthorizationCode)
	}
	if req.AuthorizationCode != "" {
		sealed, err := h.apple.ExchangeCode(ctx, req.AuthorizationCode)
		if err != nil {
			h.log.Warn("Apple token not refreshed; signing in with the stored one", "error", err)
		} else {
			profile.SealedRefreshToken = sealed
		}
	}
	return profile, req, true
}

// NativeApple handles POST /api/v1/auth/native/apple.
//
// 200 with the native pair and status signed_in for an Apple ID linked to an
// account (found by sub, whatever address the token now carries); otherwise
// 200 {status, pending_token}: needs_consents for a new person (no account
// is created until native/consents), needs_link_confirmation when the
// address belongs to an existing account (native/oauth/link with its
// password), needs_email when Apple gave no verified address. 401
// token_invalid for a token or code Apple does not vouch for; 503
// apple_unavailable when Apple does not answer and the exchange is needed
// (anyone but a linked Apple ID that already holds a token); 503
// feature_unavailable when Apple is not configured.
func (h *OAuthHandler) NativeApple(c *gin.Context) {
	profile, req, ok := h.appleProfile(c)
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
	profile, req, ok := h.appleRequest(c)
	if !ok || !h.exchangeAppleCode(c, profile, req.AuthorizationCode) {
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
