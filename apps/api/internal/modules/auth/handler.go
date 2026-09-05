package auth

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/telemetry"
	"github.com/gin-gonic/gin"
)

// Handler handles auth requests
type Handler struct {
	cfg                 *config.Config
	log                 *logger.Logger
	service             *Service
	verificationService *VerificationService
	// leads may be nil; registration works without it.
	leads LeadClaimer
	// analytics may be nil; nothing depends on it being there.
	analytics EventRecorder
}

// EventRecorder records a product fact. Declared here as the narrowest thing
// auth needs, so the two modules do not depend on each other's types.
type EventRecorder interface {
	RecordServerEvent(ctx context.Context, name string, userID int64, properties map[string]any)
	LinkVisitor(ctx context.Context, visitorID string, userID int64) error
}

// WithAnalytics attaches the recorder for facts a browser cannot be trusted to
// report: a client-sent "registered" lies when the connection drops after a
// successful request, and vanishes behind a blocker.
func (h *Handler) WithAnalytics(recorder EventRecorder) *Handler {
	h.analytics = recorder
	return h
}

// LeadClaimer carries an onboarding attempt made before registration onto the
// account it produced. Declared here as the narrowest thing auth needs, so the
// two modules do not depend on each other's types.
type LeadClaimer interface {
	ClaimInto(ctx context.Context, token string, userID int64) error
}

// WithLeads attaches the claimer used when a registration carries a lead token.
func (h *Handler) WithLeads(claimer LeadClaimer) *Handler {
	h.leads = claimer
	return h
}

// claimLead carries a guest onboarding attempt onto the new account.
//
// Best effort by design: the account already exists, and failing the
// registration because a lead could not be moved would cost the user the
// account they just created over data they can re-enter.
func (h *Handler) claimLead(c *gin.Context, token string, userID int64) {
	if h.leads == nil {
		return
	}
	if err := h.leads.ClaimInto(c.Request.Context(), token, userID); err != nil {
		h.log.Errorw("Failed to carry onboarding lead onto new account",
			"error", err, "user_id", userID)
	}
}

// NewHandler creates a new auth handler
// NewHandler takes the service rather than building one.
//
// It used to call NewService itself, which meant the process ran two of them:
// the one wired up at startup and the one the handler quietly made for itself.
// Configuration applied to the first — the token-version cache, in the case
// that cost an afternoon — was invisible to the second, and the endpoints went
// on using a service nobody had finished configuring.
func NewHandler(service *Service, cfg *config.Config, log *logger.Logger, vs *VerificationService) *Handler {
	return &Handler{
		cfg:                 cfg,
		log:                 log,
		service:             service,
		verificationService: vs,
	}
}

// RegisterRequest represents registration request
type RegisterRequest struct {
	Email    string         `json:"email" binding:"required,email"`
	Password string         `json:"password" binding:"required,min=8,max=128"`
	Name     string         `json:"name"`
	Consents *ConsentsInput `json:"consents"`
	// LeadToken names an onboarding attempt made before registering. Present,
	// it carries the answers across so nothing is asked twice.
	LeadToken string `json:"lead_token"`
	// VisitorID is this browser's analytics identifier, so what it did before
	// the account belongs to the same person as what it does after.
	VisitorID string `json:"visitor_id"`
}

// ConsentsInput represents user consent flags submitted during registration
type ConsentsInput struct {
	TermsOfService bool `json:"terms_of_service"`
	PrivacyPolicy  bool `json:"privacy_policy"`
	DataProcessing bool `json:"data_processing"`
	Marketing      bool `json:"marketing"`
}

// LoginRequest represents login request
type LoginRequest struct {
	Email      string `json:"email" binding:"required,email"`
	Password   string `json:"password" binding:"required"`
	RememberMe bool   `json:"remember_me"`
}

// RefreshRequest represents token refresh request
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// LogoutRequest represents logout request
type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// refreshCookieName is the one cookie a session needs. It is HttpOnly, so no
// script can read it — which is the whole point: a refresh token in
// localStorage is readable by anything that manages to run on the page, and a
// stolen refresh token is a session that outlives every password the victim
// changes.
const refreshCookieName = "refresh_token"

// sessionMarkerName says only "this browser has a session", and is readable
// where the refresh token deliberately is not.
//
// The refresh token's Path is scoped to the auth endpoints so it does not
// travel with every request to every route. That scoping is also why the
// frontend's edge middleware cannot see it — and something has to tell the
// edge whether to render a signed-in page or redirect. This marker does, and
// it grants nothing: it is a flag, not a credential, and every endpoint still
// demands a real token.
const sessionMarkerName = "session_present"

// rememberMeLifetime and sessionLifetime are how long the cookie lives. Without
// "remember me" it is a session cookie: closing the browser ends the session,
// which is what somebody signing in on a shared machine expects.
const rememberMeLifetime = 30 * 24 * time.Hour

// setRefreshCookie stores the refresh token where script cannot reach it.
//
// Path is scoped to the auth endpoints: the cookie is only ever needed to mint
// a new access token, so it has no business travelling with every request to
// every other route.
//
// SameSite=Lax rather than Strict: the sign-in flow through an external
// provider returns to the application via a cross-site redirect, and Strict
// would withhold the cookie on exactly that navigation, leaving the person
// signed out immediately after signing in.
func (h *Handler) setRefreshCookie(c *gin.Context, token string, rememberMe bool) {
	if token == "" {
		return
	}
	maxAge := 0 // a session cookie
	if rememberMe {
		maxAge = int(rememberMeLifetime.Seconds())
	}
	c.SetSameSite(http.SameSiteLaxMode)
	// Secure is unconditional. In development the app is served over http and
	// the browser will drop it — which is correct: the alternative is a habit
	// of sending session cookies in the clear that follows the code to
	// production.
	c.SetCookie(refreshCookieName, token, maxAge, "/api/v1/auth", "", true, true)
	c.SetCookie(sessionMarkerName, "1", maxAge, "/", "", true, true)
}

// clearRefreshCookie ends the session in the browser as well as on the server.
func (h *Handler) clearRefreshCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(refreshCookieName, "", -1, "/api/v1/auth", "", true, true)
	c.SetCookie(sessionMarkerName, "", -1, "/", "", true, true)
}

// Register handles user registration
func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	result, err := h.service.Register(c.Request.Context(), req.Email, req.Password, req.Name, c.ClientIP(), c.Request.UserAgent(), req.Consents)
	if err != nil {
		h.log.Errorw("Registration failed", "error", err, "email", req.Email)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// Carry across what they entered before registering. Best effort: the
	// account exists, and failing the registration over a lost lead would cost
	// them the account they just made.
	if req.LeadToken != "" {
		h.claimLead(c, req.LeadToken, result.User.ID)
	}

	telemetry.Record(telemetry.EventUserRegistered)
	h.recordSignUp(c, req.VisitorID, result.User.ID)

	// Send verification code (best-effort — registration still succeeds)
	if h.verificationService != nil {
		if err := h.verificationService.SendCode(c.Request.Context(), result.User.ID, result.User.Email, c.ClientIP(), c.Request.UserAgent()); err != nil {
			h.log.Errorw("Failed to send verification code after registration", "error", err, "user_id", result.User.ID)
		}
	}

	h.setRefreshCookie(c, result.RefreshToken, false)
	response.Success(c, http.StatusCreated, result)
}

// WSTicket handles POST /api/v1/auth/ws-ticket.
//
// Browsers cannot set headers on a WebSocket connection, so something has to
// travel in the URL. This is what travels — instead of the access token, which
// was good for hours against the whole API and ended up in every proxy log.
func (h *Handler) WSTicket(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	ticket, err := h.service.IssueWSTicket(c.Request.Context(), userID.(int64))
	if err != nil {
		h.log.Errorw("Failed to issue websocket ticket", "error", err)
		response.InternalError(c, "Не удалось подготовить подключение")
		return
	}

	response.Success(c, http.StatusOK, gin.H{
		"ticket":     ticket,
		"expires_in": int(WSTicketTTL.Seconds()),
	})
}

// Login handles user login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	result, err := h.service.Login(c.Request.Context(), req.Email, req.Password, c.ClientIP(), c.Request.UserAgent(), req.RememberMe)
	if err != nil {
		h.log.Errorw("Login failed", "error", err, "email", req.Email)
		telemetry.Record(telemetry.EventLoginFailed)
		response.Error(c, http.StatusUnauthorized, "Неверные учетные данные")
		return
	}

	telemetry.Record(telemetry.EventLoginSucceeded)
	if h.analytics != nil {
		h.analytics.RecordServerEvent(c.Request.Context(), "signed_in", result.User.ID,
			map[string]any{"method": "password"})
	}
	h.setRefreshCookie(c, result.RefreshToken, req.RememberMe)
	response.Success(c, http.StatusOK, result)
}

// Refresh handles token refresh
func (h *Handler) Refresh(c *gin.Context) {
	var req RefreshRequest
	// The body is optional: a session started through an external provider has
	// its refresh token in an HttpOnly cookie, which the page that completes
	// the sign-in cannot read.
	_ = c.ShouldBindJSON(&req)

	// The cookie is preferred over the body: a client that has migrated sends
	// both for one release, and the cookie is the one we want to keep working.
	fromCookie := false
	token, _ := c.Cookie(refreshCookieName)
	if token != "" {
		fromCookie = true
	} else {
		token = req.RefreshToken
	}
	if token == "" {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	result, err := h.service.RefreshTokens(c.Request.Context(), token, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		h.log.Errorw("Token refresh failed", "error", err)
		// The cookie is cleared too: leaving a refresh token the server has
		// rejected in the browser means every page load retries it.
		h.clearRefreshCookie(c)
		response.Error(c, http.StatusUnauthorized, "Invalid or expired refresh token")
		return
	}

	// Rotation: the new token replaces the old one in the browser as well.
	// The cookie keeps whatever lifetime it had — a refresh is not the moment
	// to decide whether somebody wanted to be remembered.
	h.setRefreshCookie(c, result.RefreshToken, fromCookie)
	response.Success(c, http.StatusOK, result)
}

// Logout handles user logout
func (h *Handler) Logout(c *gin.Context) {
	var req LogoutRequest
	// Best-effort parse — body may be empty for legacy clients
	_ = c.ShouldBindJSON(&req)

	token := req.RefreshToken
	if token == "" {
		token, _ = c.Cookie(refreshCookieName)
	}
	if token != "" {
		if err := h.service.RevokeRefreshToken(c.Request.Context(), token); err != nil {
			h.log.Errorw("Failed to revoke refresh token on logout", "error", err)
		}
	}

	// Whether or not the revocation worked, the browser stops holding it.
	h.clearRefreshCookie(c)
	response.SuccessWithMessage(c, http.StatusOK, "Logged out successfully", nil)
}

// GetCurrentUser returns current authenticated user
func (h *Handler) GetCurrentUser(c *gin.Context) {
	userID, _ := c.Get("user_id")
	email, _ := c.Get("user_email")
	role, _ := c.Get("user_role")

	response.Success(c, http.StatusOK, gin.H{
		"user": gin.H{
			"id":    userID,
			"email": email,
			"role":  role,
		},
	})
}

// ChangePasswordRequest represents a password change request
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8,max=128"`
}

// ChangePassword allows an authenticated user to change their password
func (h *Handler) ChangePassword(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		response.Error(c, http.StatusUnauthorized, "Требуется авторизация")
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// The change ends every session, including this one. A replacement pair
	// comes back so the person who just changed their password is not signed
	// out of the device they are standing at.
	var replacement LoginResult
	if err := h.service.ChangePassword(c.Request.Context(), userID.(int64), req.CurrentPassword, req.NewPassword, &replacement); err != nil {
		switch {
		case errors.Is(err, apperrors.ErrInvalidCredentials):
			// Its own code: a wrong confirmation password is not an expired
			// session and not a failed sign-in, and the client must be able to
			// tell the three apart.
			response.ErrorCode(c, http.StatusUnauthorized,
				apperrors.CodePasswordIncorrect, "Неверный текущий пароль", nil)
		case errors.Is(err, apperrors.ErrPasswordUnchanged):
			response.Error(c, http.StatusUnprocessableEntity, err.Error())
		case errors.Is(err, apperrors.ErrPasswordPolicy):
			response.Error(c, http.StatusUnprocessableEntity, err.Error())
		default:
			h.log.Errorw("Password change failed", "error", err, "user_id", userID)
			response.Error(c, http.StatusInternalServerError, "Не удалось изменить пароль")
		}
		return
	}

	h.setRefreshCookie(c, replacement.RefreshToken, false)
	response.SuccessWithMessage(c, http.StatusOK, "Пароль успешно изменён", gin.H{
		"token":         replacement.Token,
		"refresh_token": replacement.RefreshToken,
	})
}

// VerifyEmailRequest represents email verification request
type VerifyEmailRequest struct {
	Code string `json:"code" binding:"required"`
}

// VerifyEmail handles email verification code submission
func (h *Handler) VerifyEmail(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req VerifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	err := h.verificationService.VerifyCode(c.Request.Context(), userID.(int64), req.Code)
	if err != nil {
		switch {
		case errors.Is(err, apperrors.ErrTooManyAttempts):
			response.Error(c, http.StatusTooManyRequests, "Слишком много попыток. Запросите новый код.")
		case errors.Is(err, apperrors.ErrCodeExpired):
			response.Error(c, http.StatusBadRequest, "Код истёк. Запросите новый.")
		default:
			response.Error(c, http.StatusBadRequest, "Неверный код")
		}
		return
	}

	// A fact, recorded where it happened: the browser that confirms an address
	// may never load another screen.
	if h.analytics != nil {
		h.analytics.RecordServerEvent(c.Request.Context(), "email_verified", userID.(int64), nil)
	}
	telemetry.Record(telemetry.EventUserRegistered)

	response.SuccessWithMessage(c, http.StatusOK, "Email verified", nil)
}

// ResendVerification handles resending the verification code
func (h *Handler) ResendVerification(c *gin.Context) {
	userID, _ := c.Get("user_id")
	userEmail, _ := c.Get("user_email")

	err := h.verificationService.SendCode(
		c.Request.Context(),
		userID.(int64),
		userEmail.(string),
		c.ClientIP(),
		c.Request.UserAgent(),
	)
	if err != nil {
		if errors.Is(err, apperrors.ErrTooManyAttempts) {
			response.Error(c, http.StatusTooManyRequests, "Слишком много запросов. Попробуйте позже.")
			return
		}
		h.log.Errorw("Failed to resend verification code", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось отправить код")
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Code sent", nil)
}

// recordSignUp records the registration and joins this browser's earlier
// events to the account it just produced.
//
// Best effort throughout: analytics must never be the reason a registration
// fails.
func (h *Handler) recordSignUp(c *gin.Context, visitorID string, userID int64) {
	if h.analytics == nil {
		return
	}

	ctx := c.Request.Context()
	if visitorID != "" {
		if err := h.analytics.LinkVisitor(ctx, visitorID, userID); err != nil {
			h.log.Errorw("Failed to link visitor to new account", "error", err, "user_id", userID)
		}
	}
	h.analytics.RecordServerEvent(ctx, "registered", userID, map[string]any{"method": "password"})
}
