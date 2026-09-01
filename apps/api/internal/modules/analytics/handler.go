package analytics

import (
	"errors"
	"net/http"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler receives event batches from browsers.
type Handler struct {
	service *Service
	log     *logger.Logger
}

// NewHandler creates the handler.
func NewHandler(service *Service, log *logger.Logger) *Handler {
	return &Handler{service: service, log: log}
}

// Collect handles POST /api/v1/public/analytics/events.
//
// Public because most of the funnel happens before anybody has an account. When
// a session is present the events are attributed to it, but the endpoint never
// requires one.
func (h *Handler) Collect(c *gin.Context) {
	var batch Batch
	if err := c.ShouldBindJSON(&batch); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	var userID *int64
	if value, ok := c.Get("user_id"); ok {
		if id, ok := value.(int64); ok {
			userID = &id
		}
	}

	err := h.service.Record(c.Request.Context(), batch, userID)
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrValidation):
		// Named rather than swallowed: a client sending events nobody accepts
		// should find out at development time, not by wondering why the funnel
		// is empty.
		h.log.Info("Refused an analytics batch", "error", err)
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	default:
		h.log.Error("Failed to record analytics batch", "error", err)
		response.InternalError(c, "Не удалось записать события")
		return
	}

	response.Success(c, http.StatusAccepted, gin.H{"recorded": len(batch.Events)})
}

// Link handles POST /api/v1/analytics/identify.
//
// Called once a session exists, to join what this browser did before the
// account to what it does after.
func (h *Handler) Link(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	var req struct {
		VisitorID string `json:"visitor_id" binding:"required,uuid"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	if err := h.service.LinkVisitor(c.Request.Context(), req.VisitorID, userID.(int64)); err != nil {
		h.log.Error("Failed to link visitor", "error", err)
		response.InternalError(c, "Не удалось связать посетителя")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"linked": true})
}
