package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestHandler() *Handler {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		JWTSecret: "test-secret",
	}
	log := logger.NewLogger("test", "test")
	return NewHandler(cfg, log)
}

func TestRegister(t *testing.T) {
	handler := setupTestHandler()

	tests := []struct {
		name           string
		payload        interface{}
		expectedStatus int
		checkResponse  func(t *testing.T, body map[string]interface{})
	}{
		{
			name: "successful registration",
			payload: RegisterRequest{
				Email:    "test@example.com",
				Password: "password123",
				Name:     "Test User",
			},
			expectedStatus: http.StatusCreated,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "success", body["status"])
				data := body["data"].(map[string]interface{})
				user := data["user"].(map[string]interface{})
				assert.Equal(t, "test@example.com", user["email"])
				assert.Equal(t, "Test User", user["name"])
			},
		},
		{
			name: "invalid email",
			payload: RegisterRequest{
				Email:    "invalid-email",
				Password: "password123",
			},
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "error", body["status"])
			},
		},
		{
			name: "short password",
			payload: RegisterRequest{
				Email:    "test@example.com",
				Password: "short",
			},
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "error", body["status"])
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			body, _ := json.Marshal(tt.payload)
			c.Request = httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewBuffer(body))
			c.Request.Header.Set("Content-Type", "application/json")

			handler.Register(c)

			assert.Equal(t, tt.expectedStatus, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			if tt.checkResponse != nil {
				tt.checkResponse(t, response)
			}
		})
	}
}

func TestLogin(t *testing.T) {
	handler := setupTestHandler()

	tests := []struct {
		name           string
		payload        interface{}
		expectedStatus int
		checkResponse  func(t *testing.T, body map[string]interface{})
	}{
		{
			name: "successful login",
			payload: LoginRequest{
				Email:    "test@example.com",
				Password: "password123",
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "success", body["status"])
				data := body["data"].(map[string]interface{})
				assert.NotEmpty(t, data["token"])
				user := data["user"].(map[string]interface{})
				assert.Equal(t, "test@example.com", user["email"])
			},
		},
		{
			name: "invalid email format",
			payload: LoginRequest{
				Email:    "invalid",
				Password: "password123",
			},
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "error", body["status"])
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			body, _ := json.Marshal(tt.payload)
			c.Request = httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewBuffer(body))
			c.Request.Header.Set("Content-Type", "application/json")

			handler.Login(c)

			assert.Equal(t, tt.expectedStatus, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			if tt.checkResponse != nil {
				tt.checkResponse(t, response)
			}
		})
	}
}

func TestGetCurrentUser(t *testing.T) {
	handler := setupTestHandler()

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/auth/me", nil)

	// Set user context (simulating middleware)
	c.Set("user_id", "user-123")
	c.Set("user_email", "test@example.com")
	c.Set("user_role", "client")

	handler.GetCurrentUser(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	user := data["user"].(map[string]interface{})
	assert.Equal(t, "user-123", user["id"])
	assert.Equal(t, "test@example.com", user["email"])
	assert.Equal(t, "client", user["role"])
}
