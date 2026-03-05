package nutritioncalc

import (
	"net/http"
	"strconv"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles nutrition-calc requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	db      *database.DB
	service *Service
}

// NewHandler creates a new nutrition-calc handler
func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		db:      db,
		service: NewService(db, log),
	}
}

// GetTargets handles GET /api/v1/nutrition-calc/targets
// Returns calculated nutrition targets for a given date
func (h *Handler) GetTargets(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	dateStr := c.DefaultQuery("date", time.Now().Format("2006-01-02"))

	userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
	date, err := time.ParseInLocation("2006-01-02", dateStr, userLoc)
	if err != nil {
		h.log.Errorw("Invalid date format", "error", err, "date", dateStr)
		response.Error(c, http.StatusBadRequest, "Неверный формат даты. Используйте YYYY-MM-DD")
		return
	}

	// Try to get stored targets first
	record, err := h.service.GetTargetsForDate(c.Request.Context(), userID, date.Format("2006-01-02"))
	if err != nil {
		h.log.Errorw("Failed to get targets", "error", err, "user_id", userID, "date", dateStr)
		response.InternalError(c, "Не удалось получить целевые показатели")
		return
	}

	// If no stored targets, calculate them
	if record == nil {
		targets, err := h.service.RecalculateForDate(c.Request.Context(), userID, date)
		if err != nil {
			h.log.Errorw("Failed to calculate targets", "error", err, "user_id", userID, "date", dateStr)
			response.InternalError(c, "Не удалось рассчитать целевые показатели")
			return
		}
		if targets == nil {
			response.Success(c, http.StatusOK, gin.H{"targets": nil, "message": "Профиль не заполнен или нет данных о весе"})
			return
		}
		// Re-fetch the stored record after calculation
		record, err = h.service.GetTargetsForDate(c.Request.Context(), userID, date.Format("2006-01-02"))
		if err != nil {
			h.log.Errorw("Failed to get targets after recalculation", "error", err, "user_id", userID)
			response.InternalError(c, "Не удалось получить целевые показатели")
			return
		}
	}

	response.Success(c, http.StatusOK, record)
}

// GetHistory handles GET /api/v1/nutrition-calc/history
// Returns target vs actual nutrition data for the last N days
func (h *Handler) GetHistory(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	daysStr := c.DefaultQuery("days", "7")
	days, err := strconv.Atoi(daysStr)
	if err != nil || days < 1 {
		days = 7
	}
	if days > 30 {
		days = 30
	}

	history, err := h.service.GetHistory(c.Request.Context(), userID, days)
	if err != nil {
		h.log.Errorw("Failed to get history", "error", err, "user_id", userID, "days", days)
		response.InternalError(c, "Не удалось получить историю показателей")
		return
	}

	response.Success(c, http.StatusOK, HistoryResponse{Days: history})
}

// Recalculate handles POST /api/v1/nutrition-calc/recalculate
// Triggers recalculation of nutrition targets for today
func (h *Handler) Recalculate(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	userLoc := middleware.GetUserTimezone(c.Request.Context(), h.db, userID)
	today := time.Now().In(userLoc)

	targets, err := h.service.RecalculateForDate(c.Request.Context(), userID, today)
	if err != nil {
		h.log.Errorw("Failed to recalculate targets", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось пересчитать целевые показатели")
		return
	}

	if targets == nil {
		response.Success(c, http.StatusOK, gin.H{"targets": nil, "message": "Профиль не заполнен или нет данных о весе"})
		return
	}

	response.Success(c, http.StatusOK, targets)
}

// GetClientHistory handles GET /api/v1/curator/clients/:id/targets/history
// Returns target vs actual nutrition data for a specific client (curator use)
func (h *Handler) GetClientHistory(c *gin.Context) {
	// Verify curator is authenticated
	_, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	clientIDStr := c.Param("id")
	clientID, err := strconv.ParseInt(clientIDStr, 10, 64)
	if err != nil {
		h.log.Errorw("Invalid client ID", "error", err, "client_id", clientIDStr)
		response.Error(c, http.StatusBadRequest, "Неверный ID клиента")
		return
	}

	daysStr := c.DefaultQuery("days", "7")
	days, err := strconv.Atoi(daysStr)
	if err != nil || days < 1 {
		days = 7
	}
	if days > 30 {
		days = 30
	}

	history, err := h.service.GetHistory(c.Request.Context(), clientID, days)
	if err != nil {
		h.log.Errorw("Failed to get client history", "error", err, "client_id", clientID, "days", days)
		response.InternalError(c, "Не удалось получить историю показателей клиента")
		return
	}

	response.Success(c, http.StatusOK, HistoryResponse{Days: history})
}
