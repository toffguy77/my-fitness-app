package auth

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// OAuthHandler drives the external sign-in flow.
type OAuthHandler struct {
	cfg      *config.Config
	log      *logger.Logger
	service  *Service
	registry *oauth.Registry
}

// NewOAuthHandler creates the handler.
func NewOAuthHandler(cfg *config.Config, log *logger.Logger, service *Service, registry *oauth.Registry) *OAuthHandler {
	return &OAuthHandler{cfg: cfg, log: log, service: service, registry: registry}
}

// Cookie names for the in-flight authorization attempt. They live in cookies
// rather than a server-side table because the state is browser-scoped and
// expires in minutes — a table would need its own cleanup for nothing.
const (
	stateCookie    = "oauth_state"
	verifierCookie = "oauth_verifier"
	providerCookie = "oauth_provider"
	// Long enough for a person to sign in at the provider, short enough that a
	// stale attempt cannot be replayed later.
	oauthFlowTTL = 10 * time.Minute
)

// Providers handles GET /api/v1/auth/providers.
//
// The sign-in screen asks rather than assuming: a deployment without
// credentials for a provider must not offer a button that cannot work.
func (h *OAuthHandler) Providers(c *gin.Context) {
	response.Success(c, http.StatusOK, gin.H{"providers": h.registry.Names()})
}

// Start handles GET /api/v1/auth/oauth/:provider.
func (h *OAuthHandler) Start(c *gin.Context) {
	name := c.Param("provider")
	provider, err := h.registry.Get(name)
	if err != nil {
		response.FeatureUnavailable(c, "Вход через этот сервис недоступен")
		return
	}

	pkce, err := oauth.NewPKCE()
	if err != nil {
		h.log.Error("Failed to generate PKCE parameters", "error", err)
		response.InternalError(c, "Не удалось начать авторизацию")
		return
	}

	h.setFlowCookie(c, stateCookie, pkce.State)
	h.setFlowCookie(c, verifierCookie, pkce.Verifier)
	h.setFlowCookie(c, providerCookie, name)

	c.Redirect(http.StatusFound,
		provider.AuthorizationURL(pkce.State, pkce.Challenge, h.redirectURI(name)))
}

// Callback handles GET /api/v1/auth/oauth/:provider/callback.
func (h *OAuthHandler) Callback(c *gin.Context) {
	name := c.Param("provider")

	// The user declined at the provider; that is a choice, not a failure.
	if reason := c.Query("error"); reason != "" {
		h.log.Info("External sign-in declined by user", "provider", name, "reason", reason)
		h.redirectToApp(c, "/auth?oauth=cancelled")
		return
	}

	provider, err := h.registry.Get(name)
	if err != nil {
		h.redirectToApp(c, "/auth?oauth=unavailable")
		return
	}

	// A callback whose state does not match the browser's cookie did not
	// originate from a flow this browser started.
	expectedState, _ := c.Cookie(stateCookie)
	verifier, _ := c.Cookie(verifierCookie)
	startedProvider, _ := c.Cookie(providerCookie)
	h.clearFlowCookies(c)

	if expectedState == "" || verifier == "" ||
		c.Query("state") != expectedState || startedProvider != name {
		h.log.Warn("Rejected OAuth callback with mismatched state", "provider", name)
		h.redirectToApp(c, "/auth?oauth=invalid_state")
		return
	}

	code := c.Query("code")
	if code == "" {
		h.redirectToApp(c, "/auth?oauth=invalid_state")
		return
	}

	profile, err := provider.Exchange(c.Request.Context(), code, verifier, h.redirectURI(name))
	if err != nil {
		h.log.Error("Failed to exchange authorization code", "error", err, "provider", name)
		h.redirectToApp(c, "/auth?oauth=failed")
		return
	}

	outcome, err := h.service.SignInWithProvider(c.Request.Context(), name, profile,
		c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		h.log.Error("External sign-in failed", "error", err, "provider", name)
		h.redirectToApp(c, "/auth?oauth=failed")
		return
	}

	switch outcome.Result {
	case OAuthSignedIn, OAuthRegistered:
		// The tokens go to the app through a short-lived handoff rather than a
		// URL fragment, so they never appear in history or a Referer header.
		h.redirectWithSession(c, outcome)
	case OAuthNeedsLinkConfirmation:
		h.redirectToApp(c, "/auth/link?"+url.Values{
			"provider": {name},
			"email":    {outcome.Email},
		}.Encode())
	case OAuthNeedsEmail:
		h.redirectToApp(c, "/auth/email?"+url.Values{"provider": {name}}.Encode())
	}
}

// LinkedProviders handles GET /api/v1/auth/providers/linked.
func (h *OAuthHandler) LinkedProviders(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	linked, err := h.service.LinkedProviders(c.Request.Context(), userID.(int64))
	if err != nil {
		h.log.Error("Failed to list linked providers", "error", err)
		response.InternalError(c, "Не удалось загрузить привязки")
		return
	}

	hasPassword, err := h.service.HasPassword(c.Request.Context(), userID.(int64))
	if err != nil {
		h.log.Error("Failed to check password presence", "error", err)
		response.InternalError(c, "Не удалось загрузить привязки")
		return
	}

	response.Success(c, http.StatusOK, gin.H{
		"linked": linked,
		// The screen explains why unlinking is blocked instead of just
		// disabling a button.
		"has_password": hasPassword,
	})
}

// Unlink handles DELETE /api/v1/auth/providers/:provider.
func (h *OAuthHandler) Unlink(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	err := h.service.UnlinkProvider(c.Request.Context(), userID.(int64), c.Param("provider"))
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrConflict):
		response.Error(c, http.StatusConflict,
			"Это единственный способ входа. Сначала задайте пароль.")
		return
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Такая привязка не найдена")
		return
	default:
		h.log.Error("Failed to unlink provider", "error", err)
		response.InternalError(c, "Не удалось отвязать сервис")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"unlinked": true})
}

func (h *OAuthHandler) redirectURI(provider string) string {
	return fmt.Sprintf("%s/api/v1/auth/oauth/%s/callback", h.appOrigin(), provider)
}

func (h *OAuthHandler) appOrigin() string {
	if h.cfg.AppDomain == "" {
		return "http://localhost:3069"
	}
	return "https://" + h.cfg.AppDomain
}

func (h *OAuthHandler) redirectToApp(c *gin.Context, path string) {
	c.Redirect(http.StatusFound, h.appOrigin()+path)
}

// redirectWithSession hands the session to the app.
func (h *OAuthHandler) redirectWithSession(c *gin.Context, outcome *OAuthOutcome) {
	// The refresh token goes in an HttpOnly cookie so it never reaches
	// JavaScript, the URL, or anything that logs URLs.
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("refresh_token", outcome.User.RefreshToken,
		int((30 * 24 * time.Hour).Seconds()), "/api/v1/auth", "", true, true)

	h.redirectToApp(c, "/auth/complete?"+url.Values{
		"result": {string(outcome.Result)},
	}.Encode())
}

func (h *OAuthHandler) setFlowCookie(c *gin.Context, name, value string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(name, value, int(oauthFlowTTL.Seconds()), "/api/v1/auth", "", true, true)
}

func (h *OAuthHandler) clearFlowCookies(c *gin.Context) {
	for _, name := range []string{stateCookie, verifierCookie, providerCookie} {
		c.SetCookie(name, "", -1, "/api/v1/auth", "", true, true)
	}
}
