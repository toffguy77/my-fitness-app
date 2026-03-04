package auth

import (
	"database/sql"
	"net/http"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles auth requests
type Handler struct {
	cfg                 *config.Config
	log                 *logger.Logger
	service             *Service
	verificationService *VerificationService
}

// NewHandler creates a new auth handler
func NewHandler(db *sql.DB, cfg *config.Config, log *logger.Logger, vs *VerificationService) *Handler {
	return &Handler{
		cfg:                 cfg,
		log:                 log,
		service:             NewService(db, cfg, log),
		verificationService: vs,
	}
}

// RegisterRequest represents registration request
type RegisterRequest struct {
	Email    string         `json:"email" binding:"required,email"`
	Password string         `json:"password" binding:"required,min=8"`
	Name     string         `json:"name"`
	Consents *ConsentsInput `json:"consents"`
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
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// RefreshRequest represents token refresh request
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// LogoutRequest represents logout request
type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
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

	// Send verification code (best-effort — registration still succeeds)
	if h.verificationService != nil {
		if err := h.verificationService.SendCode(c.Request.Context(), result.User.ID, result.User.Email, c.ClientIP(), c.Request.UserAgent()); err != nil {
			h.log.Errorw("Failed to send verification code after registration", "error", err, "user_id", result.User.ID)
		}
	}

	response.Success(c, http.StatusCreated, result)
}

// Login handles user login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	result, err := h.service.Login(c.Request.Context(), req.Email, req.Password, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		h.log.Errorw("Login failed", "error", err, "email", req.Email)
		response.Error(c, http.StatusUnauthorized, "Неверные учетные данные")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// Refresh handles token refresh
func (h *Handler) Refresh(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	result, err := h.service.RefreshTokens(c.Request.Context(), req.RefreshToken, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		h.log.Errorw("Token refresh failed", "error", err)
		response.Error(c, http.StatusUnauthorized, "Invalid or expired refresh token")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// Logout handles user logout
func (h *Handler) Logout(c *gin.Context) {
	var req LogoutRequest
	// Best-effort parse — body may be empty for legacy clients
	_ = c.ShouldBindJSON(&req)

	if req.RefreshToken != "" {
		if err := h.service.RevokeRefreshToken(c.Request.Context(), req.RefreshToken); err != nil {
			h.log.Errorw("Failed to revoke refresh token on logout", "error", err)
		}
	}

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
		switch err.Error() {
		case "too many attempts":
			response.Error(c, http.StatusTooManyRequests, "Слишком много попыток. Запросите новый код.")
		case "code expired":
			response.Error(c, http.StatusBadRequest, "Код истёк. Запросите новый.")
		default:
			response.Error(c, http.StatusBadRequest, "Неверный код")
		}
		return
	}

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
		if err.Error() == "too many requests" {
			response.Error(c, http.StatusTooManyRequests, "Слишком много запросов. Попробуйте позже.")
			return
		}
		h.log.Errorw("Failed to resend verification code", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось отправить код")
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Code sent", nil)
}
