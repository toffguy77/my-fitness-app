package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func setupTestHandler(t *testing.T) (*Handler, sqlmock.Sqlmock, func()) {
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	cfg := &config.Config{
		JWTSecret: "test-secret",
	}
	log := logger.New()
	handler := NewHandler(db, cfg, log)

	cleanup := func() {
		db.Close()
	}

	return handler, mock, cleanup
}

func TestRegister(t *testing.T) {
	t.Run("successful registration", func(t *testing.T) {
		handler, mock, cleanup := setupTestHandler(t)
		defer cleanup()

		mock.ExpectQuery("INSERT INTO users").
			WithArgs("test@example.com", sqlmock.AnyArg(), "Test User").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", "client", false, time.Now()))

		mock.ExpectExec("INSERT INTO user_settings").
			WithArgs(int64(1)).
			WillReturnResult(sqlmock.NewResult(1, 1))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(RegisterRequest{
			Email:    "test@example.com",
			Password: "password123",
			Name:     "Test User",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.Register(c)

		assert.Equal(t, http.StatusCreated, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, "success", response["status"])
		data := response["data"].(map[string]interface{})
		user := data["user"].(map[string]interface{})
		assert.Equal(t, "test@example.com", user["email"])
		assert.Equal(t, "Test User", user["name"])
	})

	t.Run("invalid email", func(t *testing.T) {
		handler, _, cleanup := setupTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(RegisterRequest{
			Email:    "invalid-email",
			Password: "password123",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.Register(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("short password", func(t *testing.T) {
		handler, _, cleanup := setupTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(RegisterRequest{
			Email:    "test@example.com",
			Password: "short",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.Register(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestLogin(t *testing.T) {
	t.Run("successful login", func(t *testing.T) {
		handler, mock, cleanup := setupTestHandler(t)
		defer cleanup()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, time.Now()))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(LoginRequest{
			Email:    "test@example.com",
			Password: "password123",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.Login(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, "success", response["status"])
		data := response["data"].(map[string]interface{})
		assert.NotEmpty(t, data["token"])
		user := data["user"].(map[string]interface{})
		assert.Equal(t, "test@example.com", user["email"])
	})

	t.Run("invalid email format", func(t *testing.T) {
		handler, _, cleanup := setupTestHandler(t)
		defer cleanup()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(LoginRequest{
			Email:    "invalid",
			Password: "password123",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.Login(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("wrong password", func(t *testing.T) {
		handler, mock, cleanup := setupTestHandler(t)
		defer cleanup()

		hashedPw, _ := bcrypt.GenerateFromPassword([]byte("correctpassword"), bcrypt.DefaultCost)

		mock.ExpectQuery("SELECT id, email").
			WithArgs("test@example.com").
			WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "password", "role", "onboarding_completed", "created_at"}).
				AddRow(1, "test@example.com", "Test User", string(hashedPw), "client", false, time.Now()))

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body, _ := json.Marshal(LoginRequest{
			Email:    "test@example.com",
			Password: "wrongpassword",
		})
		c.Request = httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewBuffer(body))
		c.Request.Header.Set("Content-Type", "application/json")

		handler.Login(c)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestGetCurrentUser(t *testing.T) {
	handler, _, cleanup := setupTestHandler(t)
	defer cleanup()

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
