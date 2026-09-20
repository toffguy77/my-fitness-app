package users

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/burcev/api/internal/config"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/burcev/api/internal/shared/upload"
	"github.com/gin-gonic/gin"
)

// Handler handles user requests
type Handler struct {
	cfg              *config.Config
	log              *logger.Logger
	service          *Service
	nutritionCalcSvc *nutritioncalc.Service
}

// NewHandler creates a new users handler
func NewHandler(db *sql.DB, s3 *storage.S3Client, cfg *config.Config, log *logger.Logger, nutritionCalcSvc *nutritioncalc.Service) *Handler {
	return &Handler{
		cfg:              cfg,
		log:              log,
		service:          NewService(db, s3, cfg, log),
		nutritionCalcSvc: nutritionCalcSvc,
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

// UpdateSettingsRequest represents settings update request.
//
// Every field is a pointer, including the six that used to be plain string
// or bool. That is not enough by itself to tell "the caller left this out"
// from "the caller sent it as null" — Go's encoding/json sets a pointer
// field to nil either way — so UpdateSettings also re-parses the raw body
// into a presence set (see updateSettingsPresentKeys) and only trusts a
// pointer's nil-ness once presence confirms the key was actually there.
type UpdateSettingsRequest struct {
	Language           *string  `json:"language"`
	Units              *string  `json:"units"`
	Timezone           *string  `json:"timezone"`
	TelegramUsername   *string  `json:"telegram_username"`
	InstagramUsername  *string  `json:"instagram_username"`
	AppleHealthEnabled *bool    `json:"apple_health_enabled"`
	TargetWeight       *float64 `json:"target_weight"`
	Height             *float64 `json:"height"`
	BirthDate          *string  `json:"birth_date"`
	BiologicalSex      *string  `json:"biological_sex"`
	ActivityLevel      *string  `json:"activity_level"`
	FitnessGoal        *string  `json:"fitness_goal"`
}

// updateSettingsPresentKeys reports which top-level JSON keys the request
// body actually contained, independent of what they held. A key that maps
// to JSON null is present; a key the body never mentioned is not — and only
// this distinguishes the two once both have unmarshalled to a nil pointer.
func updateSettingsPresentKeys(raw []byte) map[string]bool {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	present := make(map[string]bool, len(m))
	for k := range m {
		present[k] = true
	}
	return present
}

// UpdateSettings updates user settings
func (h *Handler) UpdateSettings(c *gin.Context) {
	userID := getUserID(c)

	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	var req UpdateSettingsRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}
	present := updateSettingsPresentKeys(raw)

	// language/units/timezone are NOT NULL in the database (migrations
	// 014/022): a present key with a null value has no column to land in and
	// must be rejected here rather than surfacing as a 500 from a constraint
	// violation.
	if present["language"] && req.Language == nil {
		response.Error(c, http.StatusBadRequest, "Язык не может быть пустым")
		return
	}
	if present["units"] && req.Units == nil {
		response.Error(c, http.StatusBadRequest, "Единицы измерения не могут быть пустыми")
		return
	}
	if present["timezone"] && req.Timezone == nil {
		response.Error(c, http.StatusBadRequest, "Часовой пояс не может быть пустым")
		return
	}

	// Validate timezone if provided
	if req.Timezone != nil && *req.Timezone != "" {
		if _, err := time.LoadLocation(*req.Timezone); err != nil {
			response.Error(c, http.StatusBadRequest, "Неверный часовой пояс")
			return
		}
	}

	// Validate height if provided
	if req.Height != nil && (*req.Height <= 0 || *req.Height > 300) {
		response.Error(c, http.StatusBadRequest, "Рост должен быть от 1 до 300 см")
		return
	}

	// Validate birth_date if provided
	if req.BirthDate != nil && *req.BirthDate != "" {
		if _, err := time.Parse("2006-01-02", *req.BirthDate); err != nil {
			response.Error(c, http.StatusBadRequest, "Неверный формат даты рождения. Используйте YYYY-MM-DD")
			return
		}
	}

	// Validate biological_sex if provided
	if req.BiologicalSex != nil && *req.BiologicalSex != "" {
		if *req.BiologicalSex != "male" && *req.BiologicalSex != "female" {
			response.Error(c, http.StatusBadRequest, "Пол должен быть male или female")
			return
		}
	}

	// Validate activity_level if provided
	if req.ActivityLevel != nil && *req.ActivityLevel != "" {
		validLevels := map[string]bool{"sedentary": true, "light": true, "moderate": true, "active": true}
		if !validLevels[*req.ActivityLevel] {
			response.Error(c, http.StatusBadRequest, "Уровень активности должен быть: sedentary, light, moderate, active")
			return
		}
	}

	// Validate fitness_goal if provided
	if req.FitnessGoal != nil && *req.FitnessGoal != "" {
		validGoals := map[string]bool{"loss": true, "maintain": true, "gain": true}
		if !validGoals[*req.FitnessGoal] {
			response.Error(c, http.StatusBadRequest, "Цель должна быть: loss, maintain, gain")
			return
		}
	}

	// Sanitize and verify social usernames — but only the ones actually in
	// the request. An update that never mentions telegram_username (the
	// Apple Health toggle, for instance) must not re-run username
	// verification, let alone risk validation failing on a field the caller
	// never touched.
	var telegramUsername, instagramUsername string
	if req.TelegramUsername != nil {
		telegramUsername = *req.TelegramUsername
	}
	if req.InstagramUsername != nil {
		instagramUsername = *req.InstagramUsername
	}
	telegramUsername = sanitizeUsername(telegramUsername)
	instagramUsername = sanitizeUsername(instagramUsername)

	if present["telegram_username"] {
		if err := validateUsernameFormat(telegramUsername); err != nil {
			response.Error(c, http.StatusBadRequest, "Telegram: "+err.Error())
			return
		}
		if err := verifyUsernameExists(c.Request.Context(), "telegram", telegramUsername); err != nil {
			response.Error(c, http.StatusBadRequest, err.Error())
			return
		}
	}
	if present["instagram_username"] {
		if err := validateUsernameFormat(instagramUsername); err != nil {
			response.Error(c, http.StatusBadRequest, "Instagram: "+err.Error())
			return
		}
		if err := verifyUsernameExists(c.Request.Context(), "instagram", instagramUsername); err != nil {
			response.Error(c, http.StatusBadRequest, err.Error())
			return
		}
	}

	var language, units, timezone string
	if req.Language != nil {
		language = *req.Language
	}
	if req.Units != nil {
		units = *req.Units
	}
	if req.Timezone != nil {
		timezone = *req.Timezone
	}
	var appleHealthEnabled bool
	if req.AppleHealthEnabled != nil {
		appleHealthEnabled = *req.AppleHealthEnabled
	}

	settings, err := h.service.UpdateSettings(c.Request.Context(), userID, Settings{
		Language:           language,
		Units:              units,
		Timezone:           timezone,
		TelegramUsername:   telegramUsername,
		InstagramUsername:  instagramUsername,
		AppleHealthEnabled: appleHealthEnabled,
		TargetWeight:       req.TargetWeight,
		Height:             req.Height,
		BirthDate:          req.BirthDate,
		BiologicalSex:      req.BiologicalSex,
		ActivityLevel:      req.ActivityLevel,
		FitnessGoal:        req.FitnessGoal,
	}, SettingsProvided{
		Language:           present["language"],
		Units:              present["units"],
		Timezone:           present["timezone"],
		TelegramUsername:   present["telegram_username"],
		InstagramUsername:  present["instagram_username"],
		AppleHealthEnabled: present["apple_health_enabled"],
		TargetWeight:       present["target_weight"],
		Height:             present["height"],
		BirthDate:          present["birth_date"],
		BiologicalSex:      present["biological_sex"],
		ActivityLevel:      present["activity_level"],
		FitnessGoal:        present["fitness_goal"],
	})
	if err != nil {
		h.log.Errorw("Не удалось обновить настройки", "error", err, "user_id", userID)
		response.Error(c, http.StatusInternalServerError, "Не удалось обновить настройки")
		return
	}

	// Trigger async KBJU recalculation when body profile settings change
	if h.nutritionCalcSvc != nil {
		go func() {
			_, recalcErr := h.nutritionCalcSvc.RecalculateForDate(context.Background(), userID, time.Now())
			if recalcErr != nil {
				h.log.Errorw("Failed to recalculate KBJU after settings update", "error", recalcErr, "user_id", userID)
			}
		}()
	}

	response.Success(c, http.StatusOK, gin.H{"settings": settings})
}

// UploadAvatar handles avatar file upload
// maxAvatarBytes bounds a profile photo.
const maxAvatarBytes = 5 * 1024 * 1024

func (h *Handler) UploadAvatar(c *gin.Context) {
	userID := getUserID(c)

	if !h.cfg.Features.ProfileAvatars {
		response.FeatureUnavailable(c, "Загрузка фото профиля недоступна в этом окружении")
		return
	}

	header, err := c.FormFile("avatar")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Файл не найден")
		return
	}

	// Type comes from the bytes, not from the client's header; the image is
	// re-encoded, which also strips EXIF.
	uploaded, err := upload.Receive(header, upload.AllowedImages, maxAvatarBytes)
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	url, err := h.service.UploadAvatar(c.Request.Context(), userID, uploaded)
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
