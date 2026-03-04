package foodtracker

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Note: Search service methods are defined in ServiceInterface in handler.go
// The Handler struct uses the same service instance for all operations

// ============================================================================
// Food Search Handlers
// ============================================================================

// SearchFoods handles GET /api/food-tracker/search
// Searches for food items with fuzzy matching (Russian language support)
// Query parameters:
//   - q: required, search query (minimum 2 characters)
//   - limit: optional, maximum number of results (default 20, max 50)
func (h *Handler) SearchFoods(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req SearchFoodsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		h.log.Errorw("Неверные параметры запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные параметры запроса")
		return
	}

	if err := req.Validate(); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	limit := req.Limit
	if limit <= 0 {
		limit = 20
	}

	result, err := h.service.SearchFoods(c.Request.Context(), userID, req.Query, limit, req.Offset)
	if err != nil {
		h.log.Errorw("Не удалось выполнить поиск", "error", err, "query", req.Query)

		errMsg := err.Error()
		if strings.Contains(errMsg, "минимум 3 символа") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось выполнить поиск продуктов")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// LookupBarcode handles GET /api/food-tracker/barcode/:code
// Looks up a food item by barcode with cache check
// URL parameters:
//   - code: required, barcode string
func (h *Handler) LookupBarcode(c *gin.Context) {
	// Get barcode from URL parameter
	barcode := c.Param("code")
	if barcode == "" {
		response.Error(c, http.StatusBadRequest, "Штрих-код обязателен")
		return
	}

	// Trim whitespace
	barcode = strings.TrimSpace(barcode)

	// Call service to lookup barcode
	result, err := h.service.LookupBarcode(c.Request.Context(), barcode)
	if err != nil {
		h.log.Errorw("Не удалось найти продукт по штрих-коду", "error", err, "barcode", barcode)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "штрих-код обязателен") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось выполнить поиск по штрих-коду")
		return
	}

	// Log successful lookup
	if result.Found {
		h.log.Info("Barcode lookup successful",
			"barcode", barcode,
			"cached", result.Cached,
			"food_id", result.Food.ID,
		)
	} else {
		h.log.Info("Barcode not found",
			"barcode", barcode,
		)
	}

	response.Success(c, http.StatusOK, result)
}

// GetRecentFoods handles GET /api/food-tracker/recent
// Retrieves recently used foods for the authenticated user
// Query parameters:
//   - limit: optional, maximum number of results (default 10, max 50)
func (h *Handler) GetRecentFoods(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Get limit from query parameter
	limit := 10 // default
	if limitStr := c.Query("limit"); limitStr != "" {
		var parsedLimit int
		if _, err := fmt.Sscanf(limitStr, "%d", &parsedLimit); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	// Cap limit at 50
	if limit > 50 {
		limit = 50
	}

	// Call service to get recent foods
	result, err := h.service.GetRecentFoods(c.Request.Context(), userID, limit)
	if err != nil {
		h.log.Errorw("Не удалось получить недавние продукты", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить недавние продукты")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// GetFavoriteFoods handles GET /api/food-tracker/favorites
// Retrieves favorite foods for the authenticated user
// Query parameters:
//   - limit: optional, maximum number of results (default 20, max 50)
func (h *Handler) GetFavoriteFoods(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Get limit from query parameter
	limit := 20 // default
	if limitStr := c.Query("limit"); limitStr != "" {
		var parsedLimit int
		if _, err := fmt.Sscanf(limitStr, "%d", &parsedLimit); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	// Cap limit at 50
	if limit > 50 {
		limit = 50
	}

	// Call service to get favorite foods
	result, err := h.service.GetFavoriteFoods(c.Request.Context(), userID, limit)
	if err != nil {
		h.log.Errorw("Не удалось получить избранные продукты", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить избранные продукты")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// AddToFavorites handles POST /api/food-tracker/favorites/:foodId
// Adds a food item to user's favorites
// URL parameters:
//   - foodId: required, UUID of the food item
func (h *Handler) AddToFavorites(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Get food ID from URL parameter
	foodID := c.Param("foodId")
	if foodID == "" {
		response.Error(c, http.StatusBadRequest, "Идентификатор продукта обязателен")
		return
	}

	// Call service to add to favorites
	err := h.service.AddToFavorites(c.Request.Context(), userID, foodID)
	if err != nil {
		h.log.Errorw("Не удалось добавить в избранное", "error", err, "user_id", userID, "food_id", foodID)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "неверный формат") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось добавить продукт в избранное")
		return
	}

	h.log.Info("Food added to favorites",
		"user_id", userID,
		"food_id", foodID,
	)

	response.Success(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Продукт добавлен в избранное",
	})
}

// RemoveFromFavorites handles DELETE /api/food-tracker/favorites/:foodId
// Removes a food item from user's favorites
// URL parameters:
//   - foodId: required, UUID of the food item
func (h *Handler) RemoveFromFavorites(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Get food ID from URL parameter
	foodID := c.Param("foodId")
	if foodID == "" {
		response.Error(c, http.StatusBadRequest, "Идентификатор продукта обязателен")
		return
	}

	// Call service to remove from favorites
	err := h.service.RemoveFromFavorites(c.Request.Context(), userID, foodID)
	if err != nil {
		h.log.Errorw("Не удалось удалить из избранного", "error", err, "user_id", userID, "food_id", foodID)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "неверный формат") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}
		if strings.Contains(errMsg, "не найден в избранном") {
			response.NotFound(c, "Продукт не найден в избранном")
			return
		}

		response.InternalError(c, "Не удалось удалить продукт из избранного")
		return
	}

	h.log.Info("Food removed from favorites",
		"user_id", userID,
		"food_id", foodID,
	)

	response.Success(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Продукт удалён из избранного",
	})
}
