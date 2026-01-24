package users

import (
	"net/http"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles user requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service *Service
}

// NewHandler creates a new users handler
func NewHandler(cfg *config.Config, log *logger.Logger) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(cfg, log),
	}
}

// GetProfile returns user profile
func (h *Handler) GetProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")

	profile, err := h.service.GetProfile(c.Request.Context(), userID.(string))
	if err != nil {
		h.log.Errorw("Failed to get profile", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Failed to get profile")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"profile": profile})
}

// UpdateProfileRequest represents profile update request
type UpdateProfileRequest struct {
	Name string `json:"name"`
}

// UpdateProfile updates user profile
func (h *Handler) UpdateProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request data")
		return
	}

	profile, err := h.service.UpdateProfile(c.Request.Context(), userID.(string), req.Name)
	if err != nil {
		h.log.Errorw("Failed to update profile", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Failed to update profile")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"profile": profile})
}
