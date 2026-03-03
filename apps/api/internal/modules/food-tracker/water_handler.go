package foodtracker

import (
	"net/http"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// ============================================================================
// Water Tracking Handlers
// ============================================================================

// GetWaterIntake handles GET /api/food-tracker/water
// Retrieves water intake for the authenticated user on a specific date
// Query parameters:
//   - date: required, format YYYY-MM-DD
//
// Requirements: 21.1, 21.2
func (h *Handler) GetWaterIntake(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Get date from query parameter
	dateStr := c.Query("date")
	if dateStr == "" {
		response.Error(c, http.StatusBadRequest, "Дата обязательна")
		return
	}

	// Parse date in user's timezone
	userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
	date, err := time.ParseInLocation("2006-01-02", dateStr, userLoc)
	if err != nil {
		h.log.Errorw("Неверный формат даты", "error", err, "date", dateStr)
		response.Error(c, http.StatusBadRequest, "Неверный формат даты. Используйте формат ГГГГ-ММ-ДД")
		return
	}

	// Call service to get water intake
	waterLog, err := h.service.GetWaterIntake(c.Request.Context(), userID, date)
	if err != nil {
		h.log.Errorw("Не удалось получить данные о воде", "error", err, "user_id", userID, "date", dateStr)
		response.InternalError(c, "Не удалось получить данные о потреблении воды")
		return
	}

	response.Success(c, http.StatusOK, &GetWaterResponse{
		Glasses:   waterLog.Glasses,
		Goal:      waterLog.Goal,
		GlassSize: waterLog.GlassSize,
	})
}

// AddWater handles POST /api/food-tracker/water
// Adds water intake for the authenticated user
// Request body:
//   - date: required, format YYYY-MM-DD
//   - glasses: optional, number of glasses to add (default 1)
//
// Requirements: 21.1, 21.2
func (h *Handler) AddWater(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	// Bind and validate request body
	var req AddWaterRequest
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

	// Parse date in user's timezone
	userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
	date, err := time.ParseInLocation("2006-01-02", req.Date, userLoc)
	if err != nil {
		h.log.Errorw("Неверный формат даты", "error", err, "date", req.Date)
		response.Error(c, http.StatusBadRequest, "Неверный формат даты. Используйте формат ГГГГ-ММ-ДД")
		return
	}

	// Default to 1 glass if not specified
	glasses := req.Glasses
	if glasses <= 0 {
		glasses = 1
	}

	// Call service to add water
	waterLog, err := h.service.AddWater(c.Request.Context(), userID, date, glasses)
	if err != nil {
		h.log.Errorw("Не удалось добавить воду", "error", err, "user_id", userID, "date", req.Date, "glasses", glasses)

		// Check for specific error types
		errMsg := err.Error()
		if strings.Contains(errMsg, "неверный формат") {
			response.Error(c, http.StatusBadRequest, errMsg)
			return
		}

		response.InternalError(c, "Не удалось добавить данные о потреблении воды")
		return
	}

	h.log.Info("Water intake added",
		"user_id", userID,
		"date", req.Date,
		"glasses_added", glasses,
		"total_glasses", waterLog.Glasses,
	)

	response.Success(c, http.StatusOK, &GetWaterResponse{
		Glasses:   waterLog.Glasses,
		Goal:      waterLog.Goal,
		GlassSize: waterLog.GlassSize,
	})
}
