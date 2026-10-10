package mealplan

import (
	"context"
	"errors"
	"net/http"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// ServiceInterface is what the handler needs; the handler tests use a fake.
type ServiceInterface interface {
	Get(ctx context.Context, userID int64, date string) (*MealPlan, error)
	Regenerate(ctx context.Context, userID int64, date string) (*MealPlan, error)
	UpdateItem(ctx context.Context, userID int64, date, mealType string, in ItemUpdate) (*MealPlan, error)
	Alternatives(ctx context.Context, userID int64, date, mealType string) ([]Alternative, error)
	GetSettings(ctx context.Context, userID int64) (*Settings, error)
	SetSettings(ctx context.Context, userID int64, in Settings) (*Settings, error)
}

// Handler serves the client's day plan. Every route is the caller's own: the
// owner comes from the session, never from the path.
type Handler struct {
	log     *logger.Logger
	service ServiceInterface
}

// NewHandler builds the handler.
func NewHandler(log *logger.Logger, service ServiceInterface) *Handler {
	return &Handler{log: log, service: service}
}

func (h *Handler) userID(c *gin.Context) (int64, bool) {
	if v, ok := c.Get("user_id"); ok {
		if id, ok := v.(int64); ok {
			return id, true
		}
	}
	response.Unauthorized(c, "Пользователь не аутентифицирован")
	return 0, false
}

// fail answers an error from the service with the status it means.
func (h *Handler) fail(c *gin.Context, err error, what string) {
	var missing *TargetMissingError
	switch {
	case errors.As(err, &missing):
		response.ErrorCode(c, http.StatusConflict, apperrors.CodeTargetMissing,
			"Цель дня не рассчитать: не хватает данных", map[string]any{"missing": missing.Missing})
	case errors.Is(err, apperrors.ErrValidation):
		response.ErrorCode(c, http.StatusUnprocessableEntity, apperrors.CodeValidation, err.Error(), nil)
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "План не найден")
	default:
		h.log.Error("Meal plan request failed", "error", err, "action", what)
		response.InternalError(c, "Не удалось выполнить запрос")
	}
}

// Get handles GET /meal-plans/:date.
func (h *Handler) Get(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	plan, err := h.service.Get(c.Request.Context(), userID, c.Param("date"))
	if err != nil {
		h.fail(c, err, "get")
		return
	}
	response.Success(c, http.StatusOK, plan)
}

// Regenerate handles POST /meal-plans/:date/regenerate.
func (h *Handler) Regenerate(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	plan, err := h.service.Regenerate(c.Request.Context(), userID, c.Param("date"))
	if err != nil {
		h.fail(c, err, "regenerate")
		return
	}
	response.Success(c, http.StatusOK, plan)
}

// UpdateItem handles PUT /meal-plans/:date/items/:mealType.
func (h *Handler) UpdateItem(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	var in ItemUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный формат запроса")
		return
	}
	plan, err := h.service.UpdateItem(c.Request.Context(), userID, c.Param("date"), c.Param("mealType"), in)
	if err != nil {
		h.fail(c, err, "update item")
		return
	}
	response.Success(c, http.StatusOK, plan)
}

// Alternatives handles GET /meal-plans/:date/items/:mealType/alternatives.
func (h *Handler) Alternatives(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	items, err := h.service.Alternatives(c.Request.Context(), userID, c.Param("date"), c.Param("mealType"))
	if err != nil {
		h.fail(c, err, "alternatives")
		return
	}
	response.Success(c, http.StatusOK, gin.H{"items": items})
}

// GetSettings handles GET /meal-plan-settings.
func (h *Handler) GetSettings(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	out, err := h.service.GetSettings(c.Request.Context(), userID)
	if err != nil {
		h.fail(c, err, "settings")
		return
	}
	response.Success(c, http.StatusOK, out)
}

// SetSettings handles PUT /meal-plan-settings.
func (h *Handler) SetSettings(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}
	var in Settings
	if err := c.ShouldBindJSON(&in); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный формат настроек")
		return
	}
	out, err := h.service.SetSettings(c.Request.Context(), userID, in)
	if err != nil {
		h.fail(c, err, "set settings")
		return
	}
	response.Success(c, http.StatusOK, out)
}
