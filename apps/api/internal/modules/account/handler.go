package account

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler exposes the account lifecycle a user controls.
type Handler struct {
	service *Service
	log     *logger.Logger
}

// NewHandler creates the handler.
func NewHandler(service *Service, log *logger.Logger) *Handler {
	return &Handler{service: service, log: log}
}

func (h *Handler) userID(c *gin.Context) (int64, bool) {
	value, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return 0, false
	}
	id, ok := value.(int64)
	if !ok {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return 0, false
	}
	return id, true
}

type deletionRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
}

// RequestDeletion handles POST /api/v1/users/me/deletion.
func (h *Handler) RequestDeletion(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}

	var req deletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Требуется текущий пароль")
		return
	}

	status, err := h.service.RequestDeletion(c.Request.Context(), userID, req.CurrentPassword)
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrInvalidCredentials):
		response.Unauthorized(c, "Неверный пароль")
		return
	case errors.Is(err, apperrors.ErrConflict):
		response.Error(c, http.StatusConflict, "Удаление аккаунта уже запрошено")
		return
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Пользователь не найден")
		return
	default:
		h.log.Error("Failed to request account deletion", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось запросить удаление аккаунта")
		return
	}

	response.Success(c, http.StatusAccepted, status)
}

// CancelDeletion handles DELETE /api/v1/users/me/deletion.
func (h *Handler) CancelDeletion(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}

	if err := h.service.CancelDeletion(c.Request.Context(), userID); err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			response.NotFound(c, "Запроса на удаление нет")
			return
		}
		h.log.Error("Failed to cancel account deletion", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось отменить удаление аккаунта")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"cancelled": true})
}

// GetDeletionStatus handles GET /api/v1/users/me/deletion.
func (h *Handler) GetDeletionStatus(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}

	status, err := h.service.Status(c.Request.Context(), userID)
	if err != nil {
		h.log.Error("Failed to read deletion status", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить состояние аккаунта")
		return
	}

	response.Success(c, http.StatusOK, status)
}

// RequestExport handles POST /api/v1/users/me/export.
func (h *Handler) RequestExport(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}

	export, err := h.service.RequestExport(c.Request.Context(), userID)
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrConflict):
		response.Error(c, http.StatusConflict, "Выгрузка уже готовится")
		return
	case errors.Is(err, apperrors.ErrRateLimited):
		response.Error(c, http.StatusTooManyRequests, "Выгрузку можно запрашивать не чаще раза в сутки")
		return
	default:
		h.log.Error("Failed to request data export", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось запросить выгрузку данных")
		return
	}

	response.Success(c, http.StatusAccepted, export)
}

// ListExports handles GET /api/v1/users/me/export.
func (h *Handler) ListExports(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}

	exports, err := h.service.ListExports(c.Request.Context(), userID)
	if err != nil {
		h.log.Error("Failed to list data exports", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить список выгрузок")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"exports": exports})
}

// DownloadExport handles GET /api/v1/users/me/export/:id.
func (h *Handler) DownloadExport(c *gin.Context) {
	userID, ok := h.userID(c)
	if !ok {
		return
	}

	url, err := h.service.ClaimExport(c.Request.Context(), userID, c.Param("id"))
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrForbidden):
		response.Forbidden(c, "Нет доступа к этой выгрузке")
		return
	case errors.Is(err, apperrors.ErrNotFound):
		response.NotFound(c, "Выгрузка не найдена")
		return
	case errors.Is(err, apperrors.ErrGone):
		response.Error(c, http.StatusGone, "Ссылка на выгрузку уже использована или истекла")
		return
	default:
		h.log.Error("Failed to claim data export", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить выгрузку")
		return
	}

	// A redirect to a short-lived signed URL rather than streaming through the
	// API: the archive can be hundreds of megabytes.
	c.Redirect(http.StatusFound, url)
}

var _ = strconv.Itoa
