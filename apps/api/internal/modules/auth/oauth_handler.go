package auth

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/modules/leads"
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
	// leads may be nil; the flow works without it.
	leads LeadClaimer
	// analytics may be nil; nothing depends on it being there.
	analytics EventRecorder
}

// WithAnalytics attaches the recorder for facts a browser cannot report.
//
// Without it the funnel showed every account arriving by password, because the
// provider path recorded nothing at all — so the question this whole change
// exists to answer, whether people prefer signing in with a provider, had no
// data behind it.
func (h *OAuthHandler) WithAnalytics(recorder EventRecorder) *OAuthHandler {
	h.analytics = recorder
	return h
}

// WithLeads attaches the claimer that carries a guest onboarding attempt onto
// an account created through a provider — the same treatment a password
// registration gets.
func (h *OAuthHandler) WithLeads(claimer LeadClaimer) *OAuthHandler {
	h.leads = claimer
	return h
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
	// Identifies the parked profile of a sign-in that could not finish in the
	// callback. The profile itself never leaves the server.
	pendingCookie = "oauth_pending"
	// Set by the leads module when a guest saves their onboarding attempt, so
	// that a sign-up finishing at a provider can still find it. The name comes
	// from the package that issues it: written out twice, one copy was a name
	// nobody set, and the carry-over quietly did nothing.
	leadCookie = leads.LeadCookieName
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

	// A registration through a provider carries the guest's answers across in
	// the same way a password registration does; without this, one of the two
	// paths would silently ask everything again.
	if outcome.Result == OAuthRegistered && h.leads != nil {
		if token, err := c.Cookie(leadCookie); err == nil && token != "" {
			if err := h.leads.ClaimInto(c.Request.Context(), token, outcome.User.User.ID); err != nil {
				h.log.Errorw("Failed to carry onboarding lead onto provider account",
					"error", err, "user_id", outcome.User.User.ID)
			}
			c.SetCookie(leadCookie, "", -1, "/", "", true, true)
		}
	}

	// The method is the provider's own name, so the funnel separates "signed up
	// with Yandex" from "signed up with a password" rather than counting both
	// as one.
	//
	// The browser's visitor identifier cannot be linked here the way a password
	// registration links it: the callback arrives as a redirect from the
	// provider and carries no request body. What happened before the sign-up
	// therefore stays anonymous on this path.
	if h.analytics != nil {
		switch outcome.Result {
		case OAuthRegistered:
			h.analytics.RecordServerEvent(c.Request.Context(), "registered",
				outcome.User.User.ID, map[string]any{"method": provider})
		case OAuthSignedIn:
			h.analytics.RecordServerEvent(c.Request.Context(), "signed_in",
				outcome.User.User.ID, map[string]any{"method": provider})
		}
	}

	switch outcome.Result {
	case OAuthSignedIn, OAuthRegistered:
		// The tokens go to the app through a short-lived handoff rather than a
		// URL fragment, so they never appear in history or a Referer header.
		h.redirectWithSession(c, outcome)
	case OAuthNeedsLinkConfirmation:
		if !h.parkPending(c, name, profile) {
			return
		}
		h.redirectToApp(c, "/auth/link?"+url.Values{
			"provider": {name},
			"email":    {outcome.Email},
		}.Encode())
	case OAuthNeedsEmail:
		if !h.parkPending(c, name, profile) {
			return
		}
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

// parkPending stores the profile the user still has to answer for and hands the
// browser its id. Reports whether the flow can continue.
func (h *OAuthHandler) parkPending(c *gin.Context, provider string, profile *oauth.Profile) bool {
	id, err := h.service.storePendingLink(c.Request.Context(), provider, profile)
	if err != nil {
		h.log.Error("Failed to park pending external sign-in", "error", err, "provider", provider)
		h.redirectToApp(c, "/auth?oauth=failed")
		return false
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(pendingCookie, id, int(PendingLinkTTL.Seconds()), "/api/v1/auth", "", true, true)
	return true
}

// ConfirmLink handles POST /api/v1/auth/oauth/link.
//
// The address the provider reported already has an account here. The password
// is how its owner proves the account is theirs before the provider is attached
// to it.
func (h *OAuthHandler) ConfirmLink(c *gin.Context) {
	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	pendingID, err := c.Cookie(pendingCookie)
	if err != nil || pendingID == "" {
		response.Error(c, http.StatusBadRequest, "Попытка входа истекла. Начните заново.")
		return
	}

	result, err := h.service.ConfirmLinkWithPassword(c.Request.Context(), pendingID,
		req.Password, c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrInvalidCredentials):
		response.Error(c, http.StatusUnauthorized, "Неверный пароль")
		return
	case errors.Is(err, apperrors.ErrTokenInvalid):
		h.clearPendingCookie(c)
		response.Error(c, http.StatusBadRequest, "Попытка входа истекла. Начните заново.")
		return
	case errors.Is(err, apperrors.ErrConflict):
		response.Error(c, http.StatusConflict,
			"У этого аккаунта нет пароля. Войдите через сервис, который к нему уже привязан.")
		return
	default:
		h.log.Error("Failed to confirm external link", "error", err)
		response.InternalError(c, "Не удалось привязать аккаунт")
		return
	}

	h.clearPendingCookie(c)
	response.Success(c, http.StatusOK, result)
}

// CompleteEmail handles POST /api/v1/auth/oauth/email.
//
// Used when the provider returned no address. The address comes from the user,
// so it is unverified: a new account starts unverified, and an existing one
// still has to be claimed with its password.
func (h *OAuthHandler) CompleteEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Укажите корректный адрес почты")
		return
	}

	pendingID, err := c.Cookie(pendingCookie)
	if err != nil || pendingID == "" {
		response.Error(c, http.StatusBadRequest, "Попытка входа истекла. Начните заново.")
		return
	}

	outcome, err := h.service.CompleteWithEmail(c.Request.Context(), pendingID,
		strings.ToLower(strings.TrimSpace(req.Email)), c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrTokenInvalid):
		h.clearPendingCookie(c)
		response.Error(c, http.StatusBadRequest, "Попытка входа истекла. Начните заново.")
		return
	default:
		h.log.Error("Failed to complete external sign-in with address", "error", err)
		response.InternalError(c, "Не удалось завершить вход")
		return
	}

	if outcome.Result == OAuthNeedsLinkConfirmation {
		// The address belongs to somebody already; the pending row stays so the
		// confirmation step can finish the same attempt.
		response.Success(c, http.StatusOK, gin.H{
			"result": string(OAuthNeedsLinkConfirmation),
			"email":  outcome.Email,
		})
		return
	}

	h.clearPendingCookie(c)
	response.Success(c, http.StatusOK, outcome.User)
}

func (h *OAuthHandler) clearPendingCookie(c *gin.Context) {
	c.SetCookie(pendingCookie, "", -1, "/api/v1/auth", "", true, true)
}
