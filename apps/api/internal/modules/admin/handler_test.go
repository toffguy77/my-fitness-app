package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockService implements ServiceInterface for handler tests
type mockService struct {
	getUsersFunc               func(ctx context.Context) ([]AdminUser, error)
	getCuratorsFunc            func(ctx context.Context) ([]CuratorLoad, error)
	changeRoleFunc             func(ctx context.Context, userID int64, newRole string) error
	assignCuratorFunc          func(ctx context.Context, clientID, curatorID int64) error
	getConversationsFunc       func(ctx context.Context) ([]AdminConversation, error)
	getConversationMsgsFunc    func(ctx context.Context, conversationID string, cursor string, limit int) ([]AdminMessage, error)
}

func (m *mockService) GetUsers(ctx context.Context) ([]AdminUser, error) {
	return m.getUsersFunc(ctx)
}

func (m *mockService) GetCurators(ctx context.Context) ([]CuratorLoad, error) {
	return m.getCuratorsFunc(ctx)
}

func (m *mockService) ChangeRole(ctx context.Context, userID int64, newRole string) error {
	return m.changeRoleFunc(ctx, userID, newRole)
}

func (m *mockService) AssignCurator(ctx context.Context, clientID, curatorID int64) error {
	return m.assignCuratorFunc(ctx, clientID, curatorID)
}

func (m *mockService) GetConversations(ctx context.Context) ([]AdminConversation, error) {
	return m.getConversationsFunc(ctx)
}

func (m *mockService) GetConversationMessages(ctx context.Context, conversationID string, cursor string, limit int) ([]AdminMessage, error) {
	return m.getConversationMsgsFunc(ctx, conversationID, cursor, limit)
}

func setupTestHandler(t *testing.T) (*Handler, *mockService) {
	gin.SetMode(gin.TestMode)
	log := logger.New()
	mock := &mockService{}
	handler := &Handler{
		log:     log,
		service: mock,
	}
	return handler, mock
}

func TestHandlerGetUsers(t *testing.T) {
	t.Run("returns user list", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		now := time.Now()
		curatorName := "Curator"
		mock.getUsersFunc = func(ctx context.Context) ([]AdminUser, error) {
			return []AdminUser{
				{ID: 1, Email: "user@example.com", Name: "User", Role: "client", CuratorName: &curatorName, CreatedAt: now},
				{ID: 2, Email: "curator@example.com", Name: "Curator", Role: "coordinator", ClientCount: 3, CreatedAt: now},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/users", nil)

		handler.GetUsers(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])

		data := resp["data"].([]interface{})
		assert.Len(t, data, 2)
	})

	t.Run("returns 500 on service error", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.getUsersFunc = func(ctx context.Context) ([]AdminUser, error) {
			return nil, fmt.Errorf("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/users", nil)

		handler.GetUsers(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

func TestHandlerGetCurators(t *testing.T) {
	t.Run("returns curator list", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.getCuratorsFunc = func(ctx context.Context) ([]CuratorLoad, error) {
			return []CuratorLoad{
				{ID: 1, Name: "Curator One", Email: "c1@example.com", ClientCount: 5},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/curators", nil)

		handler.GetCurators(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("returns 500 on service error", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.getCuratorsFunc = func(ctx context.Context) ([]CuratorLoad, error) {
			return nil, fmt.Errorf("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/curators", nil)

		handler.GetCurators(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

func TestHandlerChangeRole(t *testing.T) {
	t.Run("successful role change", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.changeRoleFunc = func(ctx context.Context, userID int64, newRole string) error {
			assert.Equal(t, int64(1), userID)
			assert.Equal(t, "coordinator", newRole)
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/users/1/role",
			strings.NewReader(`{"role":"coordinator"}`))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Params = gin.Params{{Key: "id", Value: "1"}}

		handler.ChangeRole(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("invalid user ID", func(t *testing.T) {
		handler, _ := setupTestHandler(t)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/users/abc/role",
			strings.NewReader(`{"role":"coordinator"}`))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Params = gin.Params{{Key: "id", Value: "abc"}}

		handler.ChangeRole(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("invalid role", func(t *testing.T) {
		handler, _ := setupTestHandler(t)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/users/1/role",
			strings.NewReader(`{"role":"admin"}`))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Params = gin.Params{{Key: "id", Value: "1"}}

		handler.ChangeRole(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("user not found", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.changeRoleFunc = func(ctx context.Context, userID int64, newRole string) error {
			return fmt.Errorf("user not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/users/999/role",
			strings.NewReader(`{"role":"coordinator"}`))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Params = gin.Params{{Key: "id", Value: "999"}}

		handler.ChangeRole(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("cannot change super_admin", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.changeRoleFunc = func(ctx context.Context, userID int64, newRole string) error {
			return fmt.Errorf("cannot change super_admin role")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/users/1/role",
			strings.NewReader(`{"role":"client"}`))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Params = gin.Params{{Key: "id", Value: "1"}}

		handler.ChangeRole(c)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("cannot demote conflict", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.changeRoleFunc = func(ctx context.Context, userID int64, newRole string) error {
			return fmt.Errorf("cannot demote: no remaining curators to reassign 3 clients")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/users/1/role",
			strings.NewReader(`{"role":"client"}`))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Params = gin.Params{{Key: "id", Value: "1"}}

		handler.ChangeRole(c)

		assert.Equal(t, http.StatusConflict, w.Code)
	})
}

func TestHandlerAssignCurator(t *testing.T) {
	t.Run("successful assignment", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.assignCuratorFunc = func(ctx context.Context, clientID, curatorID int64) error {
			assert.Equal(t, int64(100), clientID)
			assert.Equal(t, int64(10), curatorID)
			return nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/assignments",
			strings.NewReader(`{"client_id":100,"curator_id":10}`))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.AssignCurator(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("invalid request body", func(t *testing.T) {
		handler, _ := setupTestHandler(t)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/assignments",
			strings.NewReader(`{}`))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.AssignCurator(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("client not found", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.assignCuratorFunc = func(ctx context.Context, clientID, curatorID int64) error {
			return fmt.Errorf("client not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/assignments",
			strings.NewReader(`{"client_id":999,"curator_id":10}`))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.AssignCurator(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("curator not found", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.assignCuratorFunc = func(ctx context.Context, clientID, curatorID int64) error {
			return fmt.Errorf("curator not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/assignments",
			strings.NewReader(`{"client_id":100,"curator_id":999}`))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.AssignCurator(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("internal error", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.assignCuratorFunc = func(ctx context.Context, clientID, curatorID int64) error {
			return fmt.Errorf("failed to create relationship")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/admin/assignments",
			strings.NewReader(`{"client_id":100,"curator_id":10}`))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.AssignCurator(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

func TestHandlerGetConversations(t *testing.T) {
	t.Run("returns conversations", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		now := time.Now()
		mock.getConversationsFunc = func(ctx context.Context) ([]AdminConversation, error) {
			return []AdminConversation{
				{ID: "conv-1", ClientID: 100, ClientName: "Client", CuratorID: 10, CuratorName: "Curator", MessageCount: 5, UpdatedAt: now},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/conversations", nil)

		handler.GetConversations(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])

		data := resp["data"].([]interface{})
		assert.Len(t, data, 1)
	})

	t.Run("returns 500 on error", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.getConversationsFunc = func(ctx context.Context) ([]AdminConversation, error) {
			return nil, fmt.Errorf("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/conversations", nil)

		handler.GetConversations(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

func TestHandlerGetConversationMessages(t *testing.T) {
	t.Run("returns messages", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		now := time.Now()
		content := "Hello"
		mock.getConversationMsgsFunc = func(ctx context.Context, conversationID string, cursor string, limit int) ([]AdminMessage, error) {
			assert.Equal(t, "conv-1", conversationID)
			assert.Equal(t, "", cursor)
			assert.Equal(t, 50, limit)
			return []AdminMessage{
				{ID: "msg-1", SenderID: 100, SenderName: "User", Type: "text", Content: &content, CreatedAt: now},
			}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/conversations/conv-1/messages", nil)
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.GetConversationMessages(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "success", resp["status"])
	})

	t.Run("passes cursor and limit", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.getConversationMsgsFunc = func(ctx context.Context, conversationID string, cursor string, limit int) ([]AdminMessage, error) {
			assert.Equal(t, "conv-1", conversationID)
			assert.Equal(t, "cursor-123", cursor)
			assert.Equal(t, 25, limit)
			return []AdminMessage{}, nil
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/conversations/conv-1/messages?cursor=cursor-123&limit=25", nil)
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.GetConversationMessages(c)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("conversation not found", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.getConversationMsgsFunc = func(ctx context.Context, conversationID string, cursor string, limit int) ([]AdminMessage, error) {
			return nil, fmt.Errorf("conversation not found")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/conversations/nonexistent/messages", nil)
		c.Params = gin.Params{{Key: "id", Value: "nonexistent"}}

		handler.GetConversationMessages(c)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("internal error", func(t *testing.T) {
		handler, mock := setupTestHandler(t)

		mock.getConversationMsgsFunc = func(ctx context.Context, conversationID string, cursor string, limit int) ([]AdminMessage, error) {
			return nil, fmt.Errorf("db error")
		}

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/conversations/conv-1/messages", nil)
		c.Params = gin.Params{{Key: "id", Value: "conv-1"}}

		handler.GetConversationMessages(c)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}
