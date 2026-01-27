package auth

import (
	"net/http"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// ResetHandler handles password reset requests
type ResetHandler struct {
	cfg     *config.Config
	log     *logger.Logger
	service *ResetService
}

// NewResetHandler creates a new reset handler
func NewResetHandler(cfg *config.Config, log *logger.Logger, service *ResetService) *ResetHandler {
	return &ResetHandler{
		cfg:     cfg,
		log:     log,
		service: service,
	}
}

// ForgotPasswordRequest represents a forgot password request
type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// ResetPasswordRequest represents a reset password request
type ResetPasswordRequest struct {
	Token    string `json:"token" binding:"required"`
	Password string `json:"password" binding:"required,min=8"`
}

// ValidateTokenRequest represents a token validation request
type ValidateTokenRequest struct {
	Token string `form:"token" binding:"required"`
}

// ForgotPassword handles forgot password requests
// POST /api/auth/forgot-password
func (h *ResetHandler) ForgotPassword(c *gin.Context) {
	var req ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Warn("Invalid forgot password request",
			"error", err,
			"ip", c.ClientIP(),
		)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Get client information
	ipAddress := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// Log the attempt
	h.log.LogSecurityEvent("password_reset_requested", "info", map[string]interface{}{
		"email":      req.Email,
		"ip_address": ipAddress,
		"user_agent": userAgent,
	})

	// Process reset request
	err := h.service.RequestPasswordReset(c.Request.Context(), req.Email, ipAddress, userAgent)

	if err != nil {
		// Check if it's a rate limit error
		if err.Error() == "too many requests" {
			h.log.Warn("Password reset rate limit exceeded",
				"email", req.Email,
				"ip", ipAddress,
			)
			response.Error(c, http.StatusTooManyRequests, "Слишком много запросов. Попробуйте позже.")
			return
		}

		// For other errors, log but return generic success message
		h.log.WithError(err).Error("Failed to process password reset request",
			"email", req.Email,
			"ip", ipAddress,
		)

		// Return generic success to prevent information leakage
		response.SuccessWithMessage(c, http.StatusOK,
			"Если аккаунт с этим email существует, вы получите инструкции по сбросу пароля.",
			nil,
		)
		return
	}

	// Always return generic success message (prevent email enumeration)
	response.SuccessWithMessage(c, http.StatusOK,
		"Если аккаунт с этим email существует, вы получите инструкции по сбросу пароля.",
		nil,
	)
}

// ResetPassword handles password reset with token
// POST /api/auth/reset-password
func (h *ResetHandler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Warn("Invalid reset password request",
			"error", err,
			"ip", c.ClientIP(),
		)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Get client information
	ipAddress := c.ClientIP()

	// Log the attempt
	h.log.LogSecurityEvent("password_reset_attempted", "info", map[string]interface{}{
		"ip_address": ipAddress,
	})

	// Reset password
	err := h.service.ResetPassword(c.Request.Context(), req.Token, req.Password, ipAddress)

	if err != nil {
		h.log.WithError(err).Warn("Password reset failed",
			"ip", ipAddress,
		)

		// Return appropriate error message
		if err.Error() == "invalid token" {
			response.Error(c, http.StatusBadRequest, "Неверная или истекшая ссылка для сброса. Запросите новую.")
			return
		}

		if err.Error() == "token expired" {
			response.Error(c, http.StatusBadRequest, "Срок действия ссылки истек. Запросите новую.")
			return
		}

		// Check if it's a password validation error
		if len(err.Error()) > 0 && err.Error()[:8] == "password" {
			response.Error(c, http.StatusBadRequest, err.Error())
			return
		}

		// Generic error for other cases
		response.Error(c, http.StatusInternalServerError, "Не удалось сбросить пароль. Попробуйте снова.")
		return
	}

	h.log.Info("Password reset successful",
		"ip", ipAddress,
	)

	response.SuccessWithMessage(c, http.StatusOK,
		"Пароль успешно изменен. Теперь вы можете войти с новым паролем.",
		nil,
	)
}

// ValidateResetToken validates a reset token
// GET /api/auth/validate-reset-token?token=xxx
func (h *ResetHandler) ValidateResetToken(c *gin.Context) {
	var req ValidateTokenRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		h.log.Warn("Invalid validate token request",
			"error", err,
			"ip", c.ClientIP(),
		)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Validate token
	tokenData, err := h.service.ValidateResetToken(c.Request.Context(), req.Token)

	if err != nil {
		h.log.Warn("Token validation failed",
			"error", err,
			"ip", c.ClientIP(),
		)

		if err.Error() == "invalid token" {
			response.Error(c, http.StatusBadRequest, "Неверная ссылка для сброса.")
			return
		}

		if err.Error() == "token expired" {
			response.Error(c, http.StatusBadRequest, "Срок действия ссылки истек.")
			return
		}

		response.Error(c, http.StatusInternalServerError, "Не удалось проверить токен.")
		return
	}

	// Return success with minimal information
	response.Success(c, http.StatusOK, gin.H{
		"valid":      true,
		"expires_at": tokenData.ExpiresAt,
	})
}
