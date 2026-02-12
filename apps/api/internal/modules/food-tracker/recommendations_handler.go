package foodtracker

import (
	"net/http"
	"strings"

	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// ============================================================================
// Recommendations Handlers
// ============================================================================

// GetRecommendations handles GET /api/food-tracker/recommendations
// Retrieves nutrient recommendations for the authenticated user
// Returns daily recommendations grouped by category, weekly recommendations, and custom recommendations
//
// Requirements: 11.1, 12.1
func (h *Handler) GetRecommendations(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Call service to get recommendations
	result, err := h.service.GetRecommendations(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Не удалось получить рекомендации", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить рекомендации по питанию")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// GetRecommendationDetail handles GET /api/food-tracker/recommendations/:id
// Retrieves detailed information about a specific nutrient recommendation
// URL parameters:
//   - id: required, UUID of the nutrient recommendation
//
// Requirements: 12.1
func (h *Handler) GetRecommendationDetail(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Get nutrient ID from URL parameter
	nutrientID := c.Param("id")
	if nutrientID == "" {
		response.Error(c, http.StatusBadRequest, "Идентификатор нутриента обязателен")
		return
	}

	// Call service to get recommendation detail
	result, err := h.service.GetRecommendationDetail(c.Request.Context(), nutrientID, userID)
	if err != nil {
		h.log.Errorw("Не удалось получить детали рекомендации", "error", err, "user_id", userID, "nutrient_id", nutrientID)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "рекомендация не найдена") {
			response.NotFound(c, "Рекомендация не найдена")
			return
		}
		if strings.Contains(errMsg, "неверный формат") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось получить детали рекомендации")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// UpdatePreferences handles PUT /api/food-tracker/recommendations/preferences
// Updates user's nutrient tracking preferences
// Request body:
//   - nutrient_ids: required, array of nutrient UUIDs to track
//
// Requirements: 13.1
func (h *Handler) UpdatePreferences(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Bind and validate request body
	var req UpdateNutrientPreferencesRequest
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

	// Call service to update preferences
	err := h.service.UpdateNutrientPreferences(c.Request.Context(), userID, req.NutrientIDs)
	if err != nil {
		h.log.Errorw("Не удалось обновить настройки", "error", err, "user_id", userID)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "неверный формат") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось обновить настройки отслеживания нутриентов")
		return
	}

	h.log.Info("Nutrient preferences updated",
		"user_id", userID,
		"nutrients_count", len(req.NutrientIDs),
	)

	response.Success(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Настройки успешно обновлены",
	})
}

// CreateCustomRecommendation handles POST /api/food-tracker/recommendations/custom
// Creates a custom nutrient recommendation for the authenticated user
// Request body:
//   - name: required, name of the custom recommendation (max 100 characters)
//   - daily_target: required, daily target value (positive number)
//   - unit: required, unit of measurement (г, мг, мкг, МЕ)
//
// Requirements: 14.1
func (h *Handler) CreateCustomRecommendation(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Bind and validate request body
	var req CreateCustomRecommendationRequest
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

	// Call service to create custom recommendation
	rec, err := h.service.CreateCustomRecommendation(c.Request.Context(), userID, &req)
	if err != nil {
		h.log.Errorw("Не удалось создать рекомендацию", "error", err, "user_id", userID, "name", req.Name)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "название") || strings.Contains(errMsg, "дневная норма") || strings.Contains(errMsg, "единица измерения") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось создать пользовательскую рекомендацию")
		return
	}

	h.log.Info("Custom recommendation created",
		"user_id", userID,
		"rec_id", rec.ID,
		"name", req.Name,
	)

	response.Success(c, http.StatusCreated, rec)
}
