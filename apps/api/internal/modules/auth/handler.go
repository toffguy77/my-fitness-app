package auth

import (
	"net/http"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles auth requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service *Service
}

// NewHandler creates a new auth handler
func NewHandler(cfg *config.Config, log *logger.Logger) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(cfg, log),
	}
}

// RegisterRequest represents registration request
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Name     string `json:"name"`
}

// LoginRequest represents login request
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Register handles user registration
func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request data")
		return
	}

	user, err := h.service.Register(c.Request.Context(), req.Email, req.Password, req.Name)
	if err != nil {
		h.log.Errorw("Registration failed", "error", err, "email", req.Email)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(c, http.StatusCreated, gin.H{"user": user})
}

// Login handles user login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request data")
		return
	}

	result, err := h.service.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		h.log.Errorw("Login failed", "error", err, "email", req.Email)
		response.Error(c, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// Logout handles user logout
func (h *Handler) Logout(c *gin.Context) {
	// TODO: Implement token invalidation if needed
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
