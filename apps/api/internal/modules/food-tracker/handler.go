package foodtracker

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// ServiceInterface defines the interface for food tracker service operations
type ServiceInterface interface {
	// Food entries
	GetEntriesByDate(ctx context.Context, userID int64, date time.Time) (*GetEntriesResponse, error)
	CreateEntry(ctx context.Context, userID int64, req *CreateEntryRequest) (*FoodEntry, error)
	UpdateEntry(ctx context.Context, userID int64, entryID string, req *UpdateEntryRequest) (*FoodEntry, error)
	DeleteEntry(ctx context.Context, userID int64, entryID string) error

	// Food search
	SearchFoods(ctx context.Context, userID int64, query string, limit int, offset int) (*SearchFoodsResponse, error)
	LookupBarcode(ctx context.Context, barcode string) (*BarcodeResponse, error)
	GetRecentFoods(ctx context.Context, userID int64, limit int) (*GetRecentFoodsResponse, error)
	GetFavoriteFoods(ctx context.Context, userID int64, limit int) (*GetFavoriteFoodsResponse, error)
	AddToFavorites(ctx context.Context, userID int64, foodID string) error
	RemoveFromFavorites(ctx context.Context, userID int64, foodID string) error

	// User foods
	CreateUserFood(ctx context.Context, userID int64, req *CreateUserFoodRequest) (*UserFood, error)
	CloneUserFood(ctx context.Context, userID int64, req *CloneUserFoodRequest) (*UserFood, error)
	GetUserFoods(ctx context.Context, userID int64) ([]UserFood, error)
	UpdateUserFood(ctx context.Context, userID int64, foodID string, req *UpdateUserFoodRequest) (*UserFood, error)
	DeleteUserFood(ctx context.Context, userID int64, foodID string) error

	// Water tracking
	GetWaterIntake(ctx context.Context, userID int64, date time.Time) (*WaterLog, error)
	AddWater(ctx context.Context, userID int64, date time.Time, glasses int) (*WaterLog, error)

	// Recommendations
	GetRecommendations(ctx context.Context, userID int64) (*GetRecommendationsResponse, error)
	GetRecommendationDetail(ctx context.Context, nutrientID string, userID int64) (*NutrientDetailResponse, error)
	UpdateNutrientPreferences(ctx context.Context, userID int64, nutrientIDs []string) error
	CreateCustomRecommendation(ctx context.Context, userID int64, req *CreateCustomRecommendationRequest) (*UserCustomRecommendation, error)
}

// Handler handles food tracker requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	db      *database.DB
	service ServiceInterface
}

// NewHandler creates a new food tracker handler
func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		db:      db,
		service: NewService(db, log),
	}
}

// getUserID extracts and validates user ID from context
func (h *Handler) getUserID(c *gin.Context) (int64, bool) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return 0, false
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор пользователя")
		return 0, false
	}

	return userID, true
}

// ============================================================================
// Food Entries Handlers
// ============================================================================

// GetEntries handles GET /api/food-tracker/entries
// Retrieves food entries for the authenticated user on a specific date
// Query parameters:
//   - date: required, format YYYY-MM-DD
func (h *Handler) GetEntries(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Bind and validate query parameters
	var req GetEntriesRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		h.log.Errorw("Неверные параметры запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные параметры запроса")
		return
	}

	// Validate request
	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// Parse date in user's timezone
	userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
	date, err := time.ParseInLocation("2006-01-02", req.Date, userLoc)
	if err != nil {
		h.log.Errorw("Неверный формат даты", "error", err, "date", req.Date)
		response.Error(c, http.StatusBadRequest, "Неверный формат даты. Используйте формат ГГГГ-ММ-ДД")
		return
	}

	// Call service to get entries
	result, err := h.service.GetEntriesByDate(c.Request.Context(), userID, date)
	if err != nil {
		h.log.Errorw("Не удалось получить записи", "error", err, "user_id", userID, "date", req.Date)
		response.InternalError(c, "Не удалось получить записи о питании")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// CreateEntry handles POST /api/food-tracker/entries
// Creates a new food entry for the authenticated user
// Request body:
//   - food_id: required, UUID of the food item
//   - meal_type: required, one of: breakfast, lunch, dinner, snack
//   - portion_type: required, one of: grams, milliliters, portion
//   - portion_amount: required, positive number
//   - time: required, format HH:MM
//   - date: required, format YYYY-MM-DD
func (h *Handler) CreateEntry(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Bind and validate request body
	var req CreateEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Validate request
	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// Call service to create entry
	entry, err := h.service.CreateEntry(c.Request.Context(), userID, &req)
	if err != nil {
		h.log.Errorw("Не удалось создать запись", "error", err, "user_id", userID, "food_id", req.FoodID)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "продукт не найден") {
			response.NotFound(c, "Продукт не найден")
			return
		}
		if strings.Contains(errMsg, "неверный формат") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось создать запись о питании")
		return
	}

	h.log.Info("Food entry created",
		"entry_id", entry.ID,
		"user_id", userID,
		"food_id", req.FoodID,
		"meal_type", req.MealType,
	)

	response.Success(c, http.StatusCreated, entry)
}

// UpdateEntry handles PUT /api/food-tracker/entries/:id
// Updates an existing food entry for the authenticated user
// URL parameters:
//   - id: required, UUID of the entry to update
//
// Request body (all optional):
//   - meal_type: one of: breakfast, lunch, dinner, snack
//   - portion_type: one of: grams, milliliters, portion
//   - portion_amount: positive number
//   - time: format HH:MM
func (h *Handler) UpdateEntry(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Get entry ID from URL parameter
	entryID := c.Param("id")
	if entryID == "" {
		response.Error(c, http.StatusBadRequest, "Идентификатор записи обязателен")
		return
	}

	// Bind and validate request body
	var req UpdateEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Validate request
	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// Call service to update entry
	entry, err := h.service.UpdateEntry(c.Request.Context(), userID, entryID, &req)
	if err != nil {
		h.log.Errorw("Не удалось обновить запись", "error", err, "user_id", userID, "entry_id", entryID)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "запись не найдена") {
			response.NotFound(c, "Запись не найдена")
			return
		}
		if strings.Contains(errMsg, "нет доступа") {
			response.Forbidden(c, "Нет доступа к этой записи")
			return
		}
		if strings.Contains(errMsg, "неверный формат") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}
		if strings.Contains(errMsg, "продукт не найден") {
			response.NotFound(c, "Продукт не найден")
			return
		}

		response.InternalError(c, "Не удалось обновить запись о питании")
		return
	}

	h.log.Info("Food entry updated",
		"entry_id", entry.ID,
		"user_id", userID,
	)

	response.Success(c, http.StatusOK, entry)
}

// DeleteEntry handles DELETE /api/food-tracker/entries/:id
// Deletes a food entry for the authenticated user
// URL parameters:
//   - id: required, UUID of the entry to delete
func (h *Handler) DeleteEntry(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Get entry ID from URL parameter
	entryID := c.Param("id")
	if entryID == "" {
		response.Error(c, http.StatusBadRequest, "Идентификатор записи обязателен")
		return
	}

	// Call service to delete entry
	err := h.service.DeleteEntry(c.Request.Context(), userID, entryID)
	if err != nil {
		h.log.Errorw("Не удалось удалить запись", "error", err, "user_id", userID, "entry_id", entryID)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "запись не найдена") {
			response.NotFound(c, "Запись не найдена")
			return
		}
		if strings.Contains(errMsg, "неверный формат") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось удалить запись о питании")
		return
	}

	h.log.Info("Food entry deleted",
		"entry_id", entryID,
		"user_id", userID,
	)

	response.Success(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Запись успешно удалена",
	})
}
