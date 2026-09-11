package admin

import (
	"context"
	"errors"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/google/uuid"
	"net/http"
	"strconv"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles admin panel requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	service ServiceInterface
	// analytics may be nil; nothing depends on it being there.
	analytics EventRecorder
}

// EventRecorder records a product fact. Declared here as the narrowest thing
// this module needs, so it does not depend on the analytics module's types.
type EventRecorder interface {
	RecordServerEvent(ctx context.Context, name string, userID int64, properties map[string]any)
}

// WithAnalytics attaches the recorder for facts only the server sees.
func (h *Handler) WithAnalytics(recorder EventRecorder) *Handler {
	h.analytics = recorder
	return h
}

// NewHandler creates a new admin handler
func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		service: NewService(db, log),
	}
}

// GetUsers handles GET /api/v1/admin/users
func (h *Handler) GetUsers(c *gin.Context) {
	page := response.ParsePage(c)

	users, total, err := h.service.GetUsers(c.Request.Context(), page)
	if err != nil {
		h.log.Error("Failed to get users", "error", err)
		response.InternalError(c, "Не удалось загрузить пользователей")
		return
	}

	response.Success(c, http.StatusOK, response.Paginated(users, total, page))
}

// GetUser handles GET /api/v1/admin/users/:id
func (h *Handler) GetUser(c *gin.Context) {
	userID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный ID пользователя")
		return
	}

	user, err := h.service.GetUser(c.Request.Context(), userID)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			response.NotFound(c, "Пользователь не найден")
			return
		}
		h.log.Error("Failed to get user", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось загрузить пользователя")
		return
	}

	response.Success(c, http.StatusOK, user)
}

// GetCurators handles GET /api/v1/admin/curators
func (h *Handler) GetCurators(c *gin.Context) {
	curators, err := h.service.GetCurators(c.Request.Context())
	if err != nil {
		h.log.Error("Failed to get curators", "error", err)
		response.InternalError(c, "Не удалось загрузить кураторов")
		return
	}

	response.Success(c, http.StatusOK, curators)
}

// ChangeRole handles POST /api/v1/admin/users/:id/role
func (h *Handler) ChangeRole(c *gin.Context) {
	userIDStr := c.Param("id")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный идентификатор пользователя")
		return
	}

	var req ChangeRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: роль должна быть coordinator или client")
		return
	}

	if err := h.service.ChangeRole(c.Request.Context(), userID, req.Role); err != nil {
		h.log.Error("Failed to change role", "error", err, "user_id", userID, "new_role", req.Role)

		switch err.Error() {
		case "user not found":
			response.NotFound(c, "Пользователь не найден")
		case "cannot change super_admin role":
			response.Forbidden(c, "Нельзя изменить роль супер-администратора")
		default:
			if len(err.Error()) > 15 && err.Error()[:15] == "cannot demote: " {
				response.Error(c, http.StatusConflict, err.Error())
			} else {
				response.InternalError(c, "Не удалось изменить роль")
			}
		}
		return
	}

	response.SuccessWithMessage(c, http.StatusOK, "Роль успешно изменена", nil)
}

// AssignCurator handles POST /api/v1/admin/assignments
func (h *Handler) AssignCurator(c *gin.Context) {
	var req AssignCuratorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные: требуются client_id и curator_id")
		return
	}

	if err := h.service.AssignCurator(c.Request.Context(), req.ClientID, req.CuratorID); err != nil {
		h.log.Error("Failed to assign curator", "error", err, "client_id", req.ClientID, "curator_id", req.CuratorID)

		errMsg := err.Error()
		if errMsg == "client not found" || errMsg == "curator not found" {
			response.NotFound(c, errMsg)
		} else {
			response.InternalError(c, "Не удалось назначить куратора")
		}
		return
	}

	if h.analytics != nil {
		h.analytics.RecordServerEvent(c.Request.Context(), "curator_assigned", req.ClientID, nil)
	}

	response.SuccessWithMessage(c, http.StatusOK, "Куратор успешно назначен", nil)
}

// GetConversations handles GET /api/v1/admin/conversations
func (h *Handler) GetConversations(c *gin.Context) {
	page := response.ParsePage(c)

	conversations, total, err := h.service.GetConversations(c.Request.Context(), page.Limit, page.Offset)
	if err != nil {
		h.log.Error("Failed to get conversations", "error", err)
		response.InternalError(c, "Не удалось загрузить чаты")
		return
	}

	response.Success(c, http.StatusOK, response.Paginated(conversations, total, page))
}

// GetConversationMessages handles GET /api/v1/admin/conversations/:id/messages
func (h *Handler) GetConversationMessages(c *gin.Context) {
	conversationID := c.Param("id")
	// An identifier of the wrong shape is a request for something that does
	// not exist, not a server fault. Passing it straight to Postgres turned a
	// mistyped URL into a 500 and an error in the log.
	if _, err := uuid.Parse(conversationID); err != nil {
		response.NotFound(c, "Чат не найден")
		return
	}
	cursor := c.Query("cursor")

	limit := 50
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil {
			limit = parsed
		}
	}

	messages, err := h.service.GetConversationMessages(c.Request.Context(), conversationID, cursor, limit)
	if err != nil {
		h.log.Error("Failed to get messages", "error", err, "conversation_id", conversationID)

		if errors.Is(err, apperrors.ErrNotFound) {
			response.NotFound(c, "Чат не найден")
			return
		}
		response.InternalError(c, "Не удалось загрузить сообщения")
		return
	}

	response.Success(c, http.StatusOK, messages)
}
