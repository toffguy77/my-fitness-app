package users

import (
	"database/sql"
	"net/http"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/gin-gonic/gin"
)

// Handler handles user requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service *Service
}

// NewHandler creates a new users handler
func NewHandler(db *sql.DB, s3 *storage.S3Client, cfg *config.Config, log *logger.Logger) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(db, s3, cfg, log),
	}
}

// GetProfile returns user profile
func (h *Handler) GetProfile(c *gin.Context) {
	userIDInterface, _ := c.Get("user_id")
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	profile, err := h.service.GetProfile(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Не удалось получить профиль", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось получить профиль")
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
	userIDInterface, _ := c.Get("user_id")
	userID, ok := userIDInterface.(int64)
	if !ok {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	profile, err := h.service.UpdateProfile(c.Request.Context(), userID, req.Name)
	if err != nil {
		h.log.Errorw("Не удалось обновить профиль", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось обновить профиль")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"profile": profile})
}
