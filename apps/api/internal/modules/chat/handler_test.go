package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/ws"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockHandlerService implements ServiceInterface for testing
type mockHandlerService struct {
	getConversationsFunc    func(ctx context.Context, userID int64) ([]Conversation, error)
	getMessagesFunc         func(ctx context.Context, conversationID string, userID int64, cursor string, limit int) ([]Message, error)
	sendMessageFunc         func(ctx context.Context, conversationID string, senderID int64, req SendMessageRequest) (*Message, error)
	markAsReadFunc          func(ctx context.Context, conversationID string, userID int64) error
	getUnreadCountFunc      func(ctx context.Context, userID int64) (int, error)
	validateParticipantFunc func(ctx context.Context, conversationID string, userID int64) error
	createFoodEntryFunc     func(ctx context.Context, conversationID string, curatorID int64, req CreateFoodEntryRequest) (*Message, error)
	getOrCreateConvFunc     func(ctx context.Context, clientID, curatorID int64) (*Conversation, error)
	addAttachmentFunc       func(ctx context.Context, messageID string, att MessageAttachment) error
	ensureConversationsFunc func(ctx context.Context) error
}

func (m *mockHandlerService) GetConversations(ctx context.Context, userID int64) ([]Conversation, error) {
	if m.getConversationsFunc != nil {
		return m.getConversationsFunc(ctx, userID)
	}
	return []Conversation{}, nil
}

func (m *mockHandlerService) GetOrCreateConversation(ctx context.Context, clientID, curatorID int64) (*Conversation, error) {
	if m.getOrCreateConvFunc != nil {
		return m.getOrCreateConvFunc(ctx, clientID, curatorID)
	}
	return &Conversation{}, nil
}

func (m *mockHandlerService) GetMessages(ctx context.Context, conversationID string, userID int64, cursor string, limit int) ([]Message, error) {
	if m.getMessagesFunc != nil {
		return m.getMessagesFunc(ctx, conversationID, userID, cursor, limit)
	}
	return []Message{}, nil
}

func (m *mockHandlerService) SendMessage(ctx context.Context, conversationID string, senderID int64, req SendMessageRequest) (*Message, error) {
	if m.sendMessageFunc != nil {
		return m.sendMessageFunc(ctx, conversationID, senderID, req)
	}
	return &Message{}, nil
}

func (m *mockHandlerService) AddAttachment(ctx context.Context, messageID string, att MessageAttachment) error {
	if m.addAttachmentFunc != nil {
		return m.addAttachmentFunc(ctx, messageID, att)
	}
	return nil
}

func (m *mockHandlerService) MarkAsRead(ctx context.Context, conversationID string, userID int64) error {
	if m.markAsReadFunc != nil {
		return m.markAsReadFunc(ctx, conversationID, userID)
	}
	return nil
}

func (m *mockHandlerService) GetUnreadCount(ctx context.Context, userID int64) (int, error) {
	if m.getUnreadCountFunc != nil {
		return m.getUnreadCountFunc(ctx, userID)
	}
	return 0, nil
}

func (m *mockHandlerService) CreateFoodEntryFromChat(ctx context.Context, conversationID string, curatorID int64, req CreateFoodEntryRequest) (*Message, error) {
	if m.createFoodEntryFunc != nil {
		return m.createFoodEntryFunc(ctx, conversationID, curatorID, req)
	}
	return &Message{}, nil
}

func (m *mockHandlerService) ValidateParticipant(ctx context.Context, conversationID string, userID int64) error {
	if m.validateParticipantFunc != nil {
		return m.validateParticipantFunc(ctx, conversationID, userID)
	}
	return nil
}

func (m *mockHandlerService) EnsureConversationsExist(ctx context.Context) error {
	if m.ensureConversationsFunc != nil {
		return m.ensureConversationsFunc(ctx)
	}
	return nil
}

// setupChatHandlerTest creates handler with mock service. db and hub are nil (suitable for
// tests that don't exercise the push-notification code path).
func setupChatHandlerTest() (*Handler, *mockHandlerService) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{JWTSecret: "test-secret"}
	log := logger.New()
	mock := &mockHandlerService{}
	handler := &Handler{
		cfg:     cfg,
		log:     log,
		service: mock,
	}
	return handler, mock
}

// setupChatHandlerTestWithDB creates handler with mock service, sqlmock db and ws hub.
// Needed for SendMessage/MarkAsRead success paths that call getOtherParticipantID and hub.SendToUser.
func setupChatHandlerTestWithDB(t *testing.T) (*Handler, *mockHandlerService, sqlmock.Sqlmock, func()) {
	gin.SetMode(gin.TestMode)
	db, sqlMock, err := sqlmock.New()
	require.NoError(t, err)

	cfg := &config.Config{JWTSecret: "test-secret"}
	log := logger.New()
	mock := &mockHandlerService{}
	hub := ws.NewHub()
	handler := &Handler{
		cfg:     cfg,
		log:     log,
		service: mock,
		db:      &database.DB{DB: db},
		hub:     hub,
	}
	return handler, mock, sqlMock, func() { db.Close() }
}

func TestHandler_GetConversations(t *testing.T) {
	t.Run("success returns conversations", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.getConversationsFunc = func(ctx context.Context, userID int64) ([]Conversation, error) {
			return []Conversation{
				{ID: "conv-1", ClientID: 1, CuratorID: 2},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations", nil)
		c.Set("user_id", int64(1))

		handler.GetConversations(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupChatHandlerTest()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations", nil)

		handler.GetConversations(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.getConversationsFunc = func(ctx context.Context, userID int64) ([]Conversation, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations", nil)
		c.Set("user_id", int64(1))

		handler.GetConversations(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

func TestHandler_GetMessages(t *testing.T) {
	t.Run("success returns messages", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.getMessagesFunc = func(ctx context.Context, conversationID string, userID int64, cursor string, limit int) ([]Message, error) {
			content := "hello"
			return []Message{
				{ID: "msg-1", ConversationID: conversationID, SenderID: 1, Type: "text", Content: &content},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations/conv-1/messages", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.GetMessages(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("forbidden when not participant", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.validateParticipantFunc = func(ctx context.Context, conversationID string, userID int64) error {
			return errors.New("not a participant")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations/conv-1/messages", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.GetMessages(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.getMessagesFunc = func(ctx context.Context, conversationID string, userID int64, cursor string, limit int) ([]Message, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations/conv-1/messages", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.GetMessages(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupChatHandlerTest()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations/conv-1/messages", nil)

		handler.GetMessages(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestHandler_SendMessage(t *testing.T) {
	t.Run("success sends text message", func(t *testing.T) {
		handler, mock, sqlMock, cleanup := setupChatHandlerTestWithDB(t)
		defer cleanup()

		content := "hello world"
		mock.sendMessageFunc = func(ctx context.Context, conversationID string, senderID int64, req SendMessageRequest) (*Message, error) {
			return &Message{ID: "msg-1", ConversationID: conversationID, SenderID: senderID, Type: "text", Content: &content}, nil
		}

		// getOtherParticipantID query
		sqlMock.ExpectQuery("SELECT CASE").
			WithArgs("conv-1", int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(2)))

		// GetUnreadCount for push notification (called via service mock, returns 0)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(SendMessageRequest{Type: "text", Content: &content})
		c.Request = httptest.NewRequest(http.MethodPost, "/conversations/conv-1/messages", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.SendMessage(c)

		assert.Equal(t, http.StatusCreated, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("invalid body returns 400", func(t *testing.T) {
		handler, _ := setupChatHandlerTest()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/conversations/conv-1/messages", bytes.NewBufferString("invalid"))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.SendMessage(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("forbidden when not participant", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.validateParticipantFunc = func(ctx context.Context, conversationID string, userID int64) error {
			return errors.New("not a participant")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		content := "hello"
		body, _ := json.Marshal(SendMessageRequest{Type: "text", Content: &content})
		c.Request = httptest.NewRequest(http.MethodPost, "/conversations/conv-1/messages", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.SendMessage(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupChatHandlerTest()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/conversations/conv-1/messages", nil)

		handler.SendMessage(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.sendMessageFunc = func(ctx context.Context, conversationID string, senderID int64, req SendMessageRequest) (*Message, error) {
			return nil, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		content := "hello"
		body, _ := json.Marshal(SendMessageRequest{Type: "text", Content: &content})
		c.Request = httptest.NewRequest(http.MethodPost, "/conversations/conv-1/messages", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.SendMessage(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

func TestHandler_MarkAsRead(t *testing.T) {
	t.Run("success marks as read", func(t *testing.T) {
		handler, mock, _, cleanup := setupChatHandlerTestWithDB(t)
		defer cleanup()

		mock.markAsReadFunc = func(ctx context.Context, conversationID string, userID int64) error {
			return nil
		}
		// GetUnreadCount returns 0 (default mock), hub.SendToUser is safe with no connected clients

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/conversations/conv-1/read", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.MarkAsRead(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.markAsReadFunc = func(ctx context.Context, conversationID string, userID int64) error {
			return errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/conversations/conv-1/read", nil)
		c.Set("user_id", int64(1))
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.MarkAsRead(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupChatHandlerTest()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/conversations/conv-1/read", nil)

		handler.MarkAsRead(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestHandler_GetUnreadCount(t *testing.T) {
	t.Run("success returns count", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.getUnreadCountFunc = func(ctx context.Context, userID int64) (int, error) {
			return 5, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations/unread", nil)
		c.Set("user_id", int64(1))

		handler.GetUnreadCount(c)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
		data := resp["data"].(map[string]interface{})
		assert.Equal(t, float64(5), data["count"])
	})

	t.Run("service error returns 500", func(t *testing.T) {
		handler, mock := setupChatHandlerTest()
		mock.getUnreadCountFunc = func(ctx context.Context, userID int64) (int, error) {
			return 0, errors.New("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations/unread", nil)
		c.Set("user_id", int64(1))

		handler.GetUnreadCount(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _ := setupChatHandlerTest()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/conversations/unread", nil)

		handler.GetUnreadCount(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}
