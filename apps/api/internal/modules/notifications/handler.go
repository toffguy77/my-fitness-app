package notifications

import (
	"context"
	"errors"
	"github.com/burcev/api/internal/shared/apperrors"
	"net/http"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// ServiceInterface defines the interface for notification service operations
type ServiceInterface interface {
	GetNotifications(ctx context.Context, userID int64, category NotificationCategory, limit, offset int) (*GetNotificationsResponse, error)
	MarkAsRead(ctx context.Context, userID int64, notificationID string) (*time.Time, error)
	MarkAllAsRead(ctx context.Context, userID int64, category NotificationCategory) (int, error)
	GetUnreadCounts(ctx context.Context, userID int64) (*UnreadCountsResponse, error)
	CreateNotification(ctx context.Context, notification *Notification) error
	GetPreferences(ctx context.Context, userID int64) (*ContentNotificationPreferences, error)
	UpdatePreferences(ctx context.Context, userID int64, req UpdatePreferencesRequest) error
	GetDeliveryPreferences(ctx context.Context, userID int64) (*DeliveryPreferences, error)
	UpdateDeliveryPreferences(ctx context.Context, userID int64, req UpdateDeliveryPreferencesRequest) error
	Unsubscribe(ctx context.Context, token string) error
}

// Handler handles notification requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service ServiceInterface
}

// NewHandler creates a new notifications handler
func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(db, log),
	}
}

// GetNotifications handles GET /api/notifications
// Retrieves notifications for the authenticated user with pagination and filtering
func (h *Handler) GetNotifications(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	// Convert to int64
	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Bind and validate query parameters
	var req GetNotificationsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		h.log.Errorw("Неверные параметры запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные параметры запроса")
		return
	}

	// Set default values if not provided
	if req.Limit <= 0 {
		req.Limit = 50
	}
	if req.Offset < 0 {
		req.Offset = 0
	}

	// Call service to get notifications
	result, err := h.service.GetNotifications(c.Request.Context(), userID, req.Category, req.Limit, req.Offset)
	if err != nil {
		h.log.Errorw("Failed to get notifications", "error", err, "user_id", userID, "category", req.Category)
		response.InternalError(c, "Не удалось получить уведомления")
		return
	}

	response.Success(c, http.StatusOK, result)
}

// MarkAsRead handles POST /api/notifications/:id/read
// Marks a single notification as read for the authenticated user
func (h *Handler) MarkAsRead(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	// Convert to int64
	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Get notification ID from URL parameter
	notificationID := c.Param("id")
	if notificationID == "" {
		response.Error(c, http.StatusBadRequest, "ID уведомления обязателен")
		return
	}

	// Call service to mark notification as read
	readAt, err := h.service.MarkAsRead(c.Request.Context(), userID, notificationID)
	if err != nil {
		h.log.Errorw("Не удалось отметить уведомление как прочитанное", "error", err, "user_id", userID, "notification_id", notificationID)

		// Check if it's a not found error
		if errors.Is(err, apperrors.ErrNotFound) {
			response.NotFound(c, "Notification not found or already read")
			return
		}

		response.InternalError(c, "Не удалось отметить уведомление как прочитанное")
		return
	}

	response.Success(c, http.StatusOK, &MarkAsReadResponse{
		Success: true,
		ReadAt:  readAt,
	})
}

// GetUnreadCounts handles GET /api/notifications/unread-counts
// Returns the count of unread notifications for both categories
func (h *Handler) GetUnreadCounts(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	// Convert to int64
	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Call service to get unread counts
	counts, err := h.service.GetUnreadCounts(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Failed to get unread counts", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить количество непрочитанных")
		return
	}

	response.Success(c, http.StatusOK, counts)
}

// MarkAllAsRead handles POST /api/notifications/mark-all-read
// Marks all notifications in a category as read for the authenticated user
func (h *Handler) MarkAllAsRead(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return
	}

	// Convert to int64
	userID, ok := userIDInterface.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", userIDInterface)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	// Bind and validate request body
	var req MarkAllAsReadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	// Call service to mark all notifications as read
	markedCount, err := h.service.MarkAllAsRead(c.Request.Context(), userID, req.Category)
	if err != nil {
		h.log.Errorw("Не удалось отметить все уведомления как прочитанные", "error", err, "user_id", userID, "category", req.Category)
		response.InternalError(c, "Не удалось отметить все уведомления как прочитанные")
		return
	}

	response.Success(c, http.StatusOK, &MarkAllAsReadResponse{
		Success:     true,
		MarkedCount: markedCount,
	})
}

// GetPreferences handles GET /api/v1/notifications/preferences
func (h *Handler) GetPreferences(c *gin.Context) {
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

	prefs, err := h.service.GetPreferences(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Failed to get preferences", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить настройки уведомлений")
		return
	}

	response.Success(c, http.StatusOK, prefs)
}

// UpdatePreferences handles PUT /api/v1/notifications/preferences
func (h *Handler) UpdatePreferences(c *gin.Context) {
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

	var req UpdatePreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Errorw("Неверные данные запроса", "error", err)
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	if err := h.service.UpdatePreferences(c.Request.Context(), userID, req); err != nil {
		h.log.Errorw("Failed to update preferences", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось сохранить настройки уведомлений")
		return
	}

	response.Success(c, http.StatusOK, map[string]string{"status": "ok"})
}

// GetDeliveryPreferences handles GET /api/v1/notifications/delivery-preferences
func (h *Handler) GetDeliveryPreferences(c *gin.Context) {
	userID, ok := requireUserID(c, h)
	if !ok {
		return
	}

	prefs, err := h.service.GetDeliveryPreferences(c.Request.Context(), userID)
	if err != nil {
		h.log.Errorw("Failed to get delivery preferences", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить настройки доставки")
		return
	}

	response.Success(c, http.StatusOK, prefs)
}

// UpdateDeliveryPreferences handles PUT /api/v1/notifications/delivery-preferences
func (h *Handler) UpdateDeliveryPreferences(c *gin.Context) {
	userID, ok := requireUserID(c, h)
	if !ok {
		return
	}

	var req UpdateDeliveryPreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}

	if err := h.service.UpdateDeliveryPreferences(c.Request.Context(), userID, req); err != nil {
		if errors.Is(err, apperrors.ErrValidation) {
			response.Fail(c, http.StatusBadRequest, err, "Проверьте настройки доставки")
			return
		}
		h.log.Errorw("Failed to update delivery preferences", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось сохранить настройки доставки")
		return
	}

	response.Success(c, http.StatusOK, map[string]string{"status": "ok"})
}

// Unsubscribe handles POST /api/v1/notifications/unsubscribe.
//
// Deliberately unauthenticated: the link is at the bottom of an email, and
// somebody who wants the email to stop should not have to remember a password
// to make it stop. The token names exactly one account and nothing else.
func (h *Handler) Unsubscribe(c *gin.Context) {
	var req struct {
		Token string `json:"token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Token == "" {
		response.Error(c, http.StatusBadRequest, "Неверная ссылка отписки")
		return
	}

	if err := h.service.Unsubscribe(c.Request.Context(), req.Token); err != nil {
		if errors.Is(err, apperrors.ErrTokenInvalid) || errors.Is(err, apperrors.ErrTokenExpired) {
			response.Fail(c, http.StatusBadRequest, err, "Ссылка отписки недействительна")
			return
		}
		if errors.Is(err, apperrors.ErrEmailUnavailable) {
			response.Fail(c, http.StatusServiceUnavailable, err, "Отправка писем сейчас недоступна")
			return
		}
		h.log.Errorw("Failed to unsubscribe", "error", err)
		response.InternalError(c, "Не удалось отписаться")
		return
	}

	response.Success(c, http.StatusOK, map[string]string{"status": "ok"})
}

// requireUserID reads the caller's id from the context set by the auth
// middleware, answering the request itself when it is not there.
func requireUserID(c *gin.Context, h *Handler) (int64, bool) {
	value, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "Пользователь не аутентифицирован")
		return 0, false
	}
	userID, ok := value.(int64)
	if !ok {
		h.log.Error("Invalid user ID type", "user_id", value)
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return 0, false
	}
	return userID, true
}
