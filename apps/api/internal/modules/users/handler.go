package users

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

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

// getUserID extracts user_id from gin context
func getUserID(c *gin.Context) int64 {
	userIDInterface, _ := c.Get("user_id")
	userID, _ := userIDInterface.(int64)
	return userID
}

// UpdateSettingsRequest represents settings update request
type UpdateSettingsRequest struct {
	Language           string   `json:"language"`
	Units              string   `json:"units"`
	Timezone           string   `json:"timezone"`
	TelegramUsername   string   `json:"telegram_username"`
	InstagramUsername  string   `json:"instagram_username"`
	AppleHealthEnabled bool     `json:"apple_health_enabled"`
	TargetWeight       *float64 `json:"target_weight"`
	Height           *float64 `json:"height"`
}

// UpdateSettings updates user settings
func (h *Handler) UpdateSettings(c *gin.Context) {
	userID := getUserID(c)

	var req UpdateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Validate timezone if provided
	if req.Timezone != "" {
		if _, err := time.LoadLocation(req.Timezone); err != nil {
			response.Error(c, http.StatusBadRequest, "Неверный часовой пояс")
			return
		}
	}

	settings, err := h.service.UpdateSettings(c.Request.Context(), userID, Settings{
		Language:           req.Language,
		Units:              req.Units,
		Timezone:           req.Timezone,
		TelegramUsername:   req.TelegramUsername,
		InstagramUsername:  req.InstagramUsername,
		AppleHealthEnabled: req.AppleHealthEnabled,
		TargetWeight:       req.TargetWeight,
		Height:           req.Height,
	})
	if err != nil {
		h.log.Errorw("Не удалось обновить настройки", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось обновить настройки")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"settings": settings})
}

// UploadAvatar handles avatar file upload
func (h *Handler) UploadAvatar(c *gin.Context) {
	userID := getUserID(c)

	file, header, err := c.Request.FormFile("avatar")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Файл не найден")
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		response.Error(c, http.StatusBadRequest, "Допустимы только изображения")
		return
	}

	if header.Size > 5*1024*1024 {
		response.Error(c, http.StatusBadRequest, "Максимальный размер файла 5 МБ")
		return
	}

	url, err := h.service.UploadAvatar(c.Request.Context(), userID, file, contentType, header.Size)
	if err != nil {
		h.log.Errorw("Не удалось загрузить фото", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось загрузить фото")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"avatar_url": url})
}

// DeleteAvatar removes the user's avatar
func (h *Handler) DeleteAvatar(c *gin.Context) {
	userID := getUserID(c)

	if err := h.service.DeleteAvatar(c.Request.Context(), userID); err != nil {
		h.log.Errorw("Не удалось удалить фото", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось удалить фото")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Фото удалено"})
}

// CompleteOnboarding marks user onboarding as complete
func (h *Handler) CompleteOnboarding(c *gin.Context) {
	userID := getUserID(c)

	if err := h.service.CompleteOnboarding(c.Request.Context(), userID); err != nil {
		h.log.Errorw("Не удалось завершить онбординг", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось завершить онбординг")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"message": "Онбординг завершён"})
}
