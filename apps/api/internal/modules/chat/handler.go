package chat

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/response"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/burcev/api/internal/shared/ws"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Handler handles chat HTTP requests
type Handler struct {
	cfg     *config.Config
	log     *logger.Logger
	db      *database.DB
	service ServiceInterface
	s3      *storage.S3Client
	hub     *ws.Hub
}

// NewHandler creates a new chat handler
func NewHandler(cfg *config.Config, log *logger.Logger, db *database.DB, s3 *storage.S3Client, hub *ws.Hub) *Handler {
	return &Handler{
		cfg:     cfg,
		log:     log,
		db:      db,
		service: NewService(db, log),
		s3:      s3,
		hub:     hub,
	}
}

// getUserID extracts the authenticated user ID from the Gin context
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

// getOtherParticipantID returns the other participant's user ID in a conversation
func (h *Handler) getOtherParticipantID(c *gin.Context, conversationID string, currentUserID int64) (int64, error) {
	query := `
		SELECT CASE
			WHEN client_id = $2 THEN curator_id
			ELSE client_id
		END
		FROM conversations WHERE id = $1
	`
	var otherID int64
	err := h.db.DB.QueryRowContext(c.Request.Context(), query, conversationID, currentUserID).Scan(&otherID)
	if err != nil {
		return 0, fmt.Errorf("failed to get other participant: %w", err)
	}
	return otherID, nil
}

// GetConversations handles GET /api/v1/conversations
func (h *Handler) GetConversations(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	conversations, err := h.service.GetConversations(c.Request.Context(), userID)
	if err != nil {
		h.log.Error("Failed to get conversations", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось загрузить список чатов")
		return
	}

	response.Success(c, http.StatusOK, conversations)
}

// GetMessages handles GET /api/v1/conversations/:id/messages?cursor=&limit=
func (h *Handler) GetMessages(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	conversationID := c.Param("id")

	// Validate participant
	if err := h.service.ValidateParticipant(c.Request.Context(), conversationID, userID); err != nil {
		h.log.Warn("Participant validation failed", "error", err, "user_id", userID, "conversation_id", conversationID)
		response.Forbidden(c, "Нет доступа к этому чату")
		return
	}

	cursor := c.Query("cursor")

	limit := 50
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil {
			limit = parsed
		}
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	messages, err := h.service.GetMessages(c.Request.Context(), conversationID, userID, cursor, limit)
	if err != nil {
		h.log.Error("Failed to get messages", "error", err, "conversation_id", conversationID)
		response.InternalError(c, "Не удалось загрузить сообщения")
		return
	}

	response.Success(c, http.StatusOK, messages)
}

// SendMessage handles POST /api/v1/conversations/:id/messages
func (h *Handler) SendMessage(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	conversationID := c.Param("id")

	// Validate participant
	if err := h.service.ValidateParticipant(c.Request.Context(), conversationID, userID); err != nil {
		h.log.Warn("Participant validation failed", "error", err, "user_id", userID, "conversation_id", conversationID)
		response.Forbidden(c, "Нет доступа к этому чату")
		return
	}

	var req SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный формат данных: "+err.Error())
		return
	}

	msg, err := h.service.SendMessage(c.Request.Context(), conversationID, userID, req)
	if err != nil {
		h.log.Error("Failed to send message", "error", err, "conversation_id", conversationID, "user_id", userID)
		response.InternalError(c, "Не удалось отправить сообщение")
		return
	}

	// Push real-time notification to the other participant
	otherID, err := h.getOtherParticipantID(c, conversationID, userID)
	if err == nil {
		h.hub.SendToUser(otherID, ws.OutgoingEvent{
			Type: ws.EventNewMessage,
			Data: msg,
		})
	}

	response.Success(c, http.StatusCreated, msg)
}

// UploadAttachment handles POST /api/v1/conversations/:id/upload
func (h *Handler) UploadAttachment(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	conversationID := c.Param("id")

	// Validate participant
	if err := h.service.ValidateParticipant(c.Request.Context(), conversationID, userID); err != nil {
		h.log.Warn("Participant validation failed", "error", err, "user_id", userID, "conversation_id", conversationID)
		response.Forbidden(c, "Нет доступа к этому чату")
		return
	}

	// Parse multipart form (max 10MB)
	if err := c.Request.ParseMultipartForm(10 << 20); err != nil {
		response.Error(c, http.StatusBadRequest, "Файл слишком большой (максимум 10 МБ)")
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Файл не найден в запросе")
		return
	}
	defer file.Close()

	if h.s3 == nil {
		response.InternalError(c, "Загрузка файлов временно недоступна")
		return
	}

	// Generate S3 key
	ext := filepath.Ext(header.Filename)
	s3Key := fmt.Sprintf("chat/%s/%s%s", conversationID, uuid.New().String(), ext)

	// Determine content type
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Upload to S3
	fileURL, err := h.s3.UploadFile(c.Request.Context(), s3Key, file, contentType, header.Size)
	if err != nil {
		h.log.Error("Failed to upload file", "error", err, "conversation_id", conversationID)
		response.InternalError(c, "Не удалось загрузить файл")
		return
	}

	// Build attachment info
	att := MessageAttachment{
		ID:       uuid.New().String(),
		FileURL:  fileURL,
		FileName: header.Filename,
		FileSize: header.Size,
		MimeType: contentType,
	}

	response.Success(c, http.StatusOK, att)
}

// MarkAsRead handles POST /api/v1/conversations/:id/read
func (h *Handler) MarkAsRead(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	conversationID := c.Param("id")

	if err := h.service.MarkAsRead(c.Request.Context(), conversationID, userID); err != nil {
		h.log.Error("Failed to mark as read", "error", err, "conversation_id", conversationID, "user_id", userID)
		response.InternalError(c, "Не удалось отметить как прочитанное")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"status": "ok"})
}

// GetUnreadCount handles GET /api/v1/conversations/unread
func (h *Handler) GetUnreadCount(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	count, err := h.service.GetUnreadCount(c.Request.Context(), userID)
	if err != nil {
		h.log.Error("Failed to get unread count", "error", err, "user_id", userID)
		response.InternalError(c, "Не удалось получить количество непрочитанных")
		return
	}

	response.Success(c, http.StatusOK, gin.H{"count": count})
}

// CreateFoodEntry handles POST /api/v1/conversations/:id/messages/:msgId/food-entry
func (h *Handler) CreateFoodEntry(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	conversationID := c.Param("id")

	// Validate participant
	if err := h.service.ValidateParticipant(c.Request.Context(), conversationID, userID); err != nil {
		h.log.Warn("Participant validation failed", "error", err, "user_id", userID, "conversation_id", conversationID)
		response.Forbidden(c, "Нет доступа к этому чату")
		return
	}

	var req CreateFoodEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверный формат данных: "+err.Error())
		return
	}

	msg, err := h.service.CreateFoodEntryFromChat(c.Request.Context(), conversationID, userID, req)
	if err != nil {
		h.log.Error("Failed to create food entry", "error", err, "conversation_id", conversationID, "user_id", userID)
		// Check for authorization errors from the service
		if strings.Contains(err.Error(), "only the curator") || strings.Contains(err.Error(), "no active relationship") {
			response.Forbidden(c, err.Error())
			return
		}
		response.InternalError(c, "Не удалось создать запись о питании")
		return
	}

	// Push real-time notification to the client
	otherID, err := h.getOtherParticipantID(c, conversationID, userID)
	if err == nil {
		h.hub.SendToUser(otherID, ws.OutgoingEvent{
			Type: ws.EventNewMessage,
			Data: msg,
		})
	}

	response.Success(c, http.StatusCreated, msg)
}

// websocket upgrader with permissive origin check (JWT validates the user)
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// HandleWebSocket handles GET /ws
func (h *Handler) HandleWebSocket(c *gin.Context) {
	// Extract JWT from query param
	tokenStr := c.Query("token")
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token required"})
		return
	}

	// Parse JWT manually
	token, err := jwt.ParseWithClaims(tokenStr, &middleware.UserClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(h.cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	claims, ok := token.Claims.(*middleware.UserClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid claims"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.log.Error("WebSocket upgrade failed", "error", err, "user_id", claims.UserID)
		return
	}

	// Create client and register in hub
	client := ws.NewClient(h.hub, conn, claims.UserID)
	h.hub.Register(claims.UserID, client)

	h.log.Info("WebSocket connected", "user_id", claims.UserID)

	// Start write pump in goroutine
	go client.WritePump()

	// Start read pump (blocks until connection closes)
	// Forward typing events to the other participant in that conversation
	client.ReadPump(func(userID int64, event ws.IncomingEvent) {
		if event.Type == ws.EventTyping {
			var typing ws.TypingData
			if err := json.Unmarshal(event.Data, &typing); err != nil {
				h.log.Warn("Failed to unmarshal typing event", "error", err)
				return
			}
			typing.UserID = userID

			// Get the other participant and forward the typing event
			otherID, err := h.getOtherParticipantID(c, typing.ConversationID, userID)
			if err != nil {
				return
			}

			h.hub.SendToUser(otherID, ws.OutgoingEvent{
				Type: ws.EventTyping,
				Data: typing,
			})
		}
	})
}
