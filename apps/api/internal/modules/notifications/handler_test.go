package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// MockService is a mock implementation of the Service interface
type MockService struct {
	mock.Mock
}

func (m *MockService) GetNotifications(ctx context.Context, userID int64, category NotificationCategory, limit, offset int) (*GetNotificationsResponse, error) {
	args := m.Called(ctx, userID, category, limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*GetNotificationsResponse), args.Error(1)
}

func (m *MockService) MarkAsRead(ctx context.Context, userID int64, notificationID string) (*time.Time, error) {
	args := m.Called(ctx, userID, notificationID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*time.Time), args.Error(1)
}

func (m *MockService) MarkAllAsRead(ctx context.Context, userID int64, category NotificationCategory) (int, error) {
	args := m.Called(ctx, userID, category)
	return args.Int(0), args.Error(1)
}

func (m *MockService) GetUnreadCounts(ctx context.Context, userID int64) (*UnreadCountsResponse, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*UnreadCountsResponse), args.Error(1)
}

func (m *MockService) CreateNotification(ctx context.Context, notification *Notification) error {
	args := m.Called(ctx, notification)
	return args.Error(0)
}

func setupTestHandlerWithMock() (*Handler, *MockService) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		Env:       "test",
		JWTSecret: "test-secret",
	}
	log := logger.New()
	mockService := new(MockService)

	handler := &Handler{
		cfg:     cfg,
		log:     log,
		service: mockService,
	}

	return handler, mockService
}

func TestNewHandler(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	assert.NotNil(t, handler)
	assert.NotNil(t, handler.cfg)
	assert.NotNil(t, handler.log)
	assert.NotNil(t, handler.service)
	assert.Equal(t, mockService, handler.service)
}

func TestGetNotifications_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	// Setup mock expectations
	notifications := []Notification{
		{
			ID:        uuid.New().String(),
			UserID:    1,
			Category:  CategoryMain,
			Type:      TypeGeneral,
			Title:     "Test Notification",
			Content:   "Test content",
			CreatedAt: time.Now(),
		},
	}
	response := &GetNotificationsResponse{
		Notifications: notifications,
		Total:         1,
		HasMore:       false,
	}
	mockService.On("GetNotifications", mock.Anything, int64(1), CategoryMain, 10, 0).
		Return(response, nil)

	router := gin.New()
	router.GET("/notifications", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetNotifications(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/notifications?category=main&limit=10&offset=0", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.Equal(t, "success", resp["status"])
	assert.NotNil(t, resp["data"])

	data := resp["data"].(map[string]interface{})
	assert.NotNil(t, data["notifications"])
	assert.NotNil(t, data["total"])
	assert.NotNil(t, data["has_more"])

	mockService.AssertExpectations(t)
}

func TestGetNotifications_MissingCategory(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/notifications", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetNotifications(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/notifications", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
	assert.Equal(t, "Неверные параметры запроса", response["message"])
}

func TestGetNotifications_InvalidCategory(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/notifications", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetNotifications(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/notifications?category=invalid", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
}

func TestGetNotifications_Unauthenticated(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/notifications", handler.GetNotifications)

	req := httptest.NewRequest(http.MethodGet, "/notifications?category=main", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
	assert.Equal(t, "Пользователь не аутентифицирован", response["message"])
}

func TestMarkAsRead_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	notificationID := uuid.New().String()
	readAt := time.Now()

	mockService.On("MarkAsRead", mock.Anything, int64(1), notificationID).
		Return(&readAt, nil)

	router := gin.New()
	router.POST("/notifications/:id/read", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.MarkAsRead(c)
	})

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/notifications/%s/read", notificationID), nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	assert.Equal(t, true, data["success"])
	assert.NotNil(t, data["read_at"])

	mockService.AssertExpectations(t)
}

func TestMarkAsRead_NotFound(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	notificationID := uuid.New().String()

	mockService.On("MarkAsRead", mock.Anything, int64(1), notificationID).
		Return((*time.Time)(nil), fmt.Errorf("notification not found or already read"))

	router := gin.New()
	router.POST("/notifications/:id/read", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.MarkAsRead(c)
	})

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/notifications/%s/read", notificationID), nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
	assert.Equal(t, "Notification not found or already read", response["message"])

	mockService.AssertExpectations(t)
}

func TestMarkAsRead_Unauthenticated(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/notifications/:id/read", handler.MarkAsRead)

	req := httptest.NewRequest(http.MethodPost, "/notifications/test-id/read", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
	assert.Equal(t, "Пользователь не аутентифицирован", response["message"])
}

func TestGetUnreadCounts_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	counts := &UnreadCountsResponse{
		Main:    5,
		Content: 3,
	}

	mockService.On("GetUnreadCounts", mock.Anything, int64(1)).
		Return(counts, nil)

	router := gin.New()
	router.GET("/unread-counts", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.GetUnreadCounts(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/unread-counts", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	assert.Equal(t, float64(5), data["main"])
	assert.Equal(t, float64(3), data["content"])

	mockService.AssertExpectations(t)
}

func TestGetUnreadCounts_Unauthenticated(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.GET("/unread-counts", handler.GetUnreadCounts)

	req := httptest.NewRequest(http.MethodGet, "/unread-counts", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
	assert.Equal(t, "Пользователь не аутентифицирован", response["message"])
}

func TestMarkAllAsRead_Success(t *testing.T) {
	handler, mockService := setupTestHandlerWithMock()

	mockService.On("MarkAllAsRead", mock.Anything, int64(1), CategoryMain).
		Return(5, nil)

	router := gin.New()
	router.POST("/mark-all-read", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.MarkAllAsRead(c)
	})

	reqBody := MarkAllAsReadRequest{
		Category: CategoryMain,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mark-all-read", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	assert.Equal(t, true, data["success"])
	assert.Equal(t, float64(5), data["marked_count"])

	mockService.AssertExpectations(t)
}

func TestMarkAllAsRead_InvalidCategory(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/mark-all-read", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		handler.MarkAllAsRead(c)
	})

	reqBody := map[string]string{
		"category": "invalid",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mark-all-read", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
	// Localization: error message is in Russian
	assert.Equal(t, "Неверные данные запроса", response["message"])
}

func TestMarkAllAsRead_Unauthenticated(t *testing.T) {
	handler, _ := setupTestHandlerWithMock()

	router := gin.New()
	router.POST("/mark-all-read", handler.MarkAllAsRead)

	reqBody := MarkAllAsReadRequest{
		Category: CategoryMain,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mark-all-read", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
	assert.Equal(t, "Пользователь не аутентифицирован", response["message"])
}
