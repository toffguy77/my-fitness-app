package users

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
		Env:       "test",
		JWTSecret: "test-secret",
	}
	log := logger.New()
	return NewHandler(nil, nil, cfg, log)
}

func TestNewHandler(t *testing.T) {
	handler := setupTestHandler()
	assert.NotNil(t, handler)
	assert.NotNil(t, handler.cfg)
	assert.NotNil(t, handler.log)
	assert.NotNil(t, handler.service)
}

func TestGetProfile_NilDB(t *testing.T) {
	// With nil DB, GetProfile panics → Recovery returns 500
	handler := setupTestHandler()
	router := gin.New()
	router.Use(gin.Recovery())

	router.GET("/profile", func(c *gin.Context) {
		c.Set("user_id", int64(123))
		handler.GetProfile(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/profile", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestUpdateProfile_NilDB(t *testing.T) {
	// With nil DB, UpdateProfile panics → Recovery returns 500
	handler := setupTestHandler()
	router := gin.New()
	router.Use(gin.Recovery())

	router.PUT("/profile", func(c *gin.Context) {
		c.Set("user_id", int64(123))
		handler.UpdateProfile(c)
	})

	reqBody := UpdateProfileRequest{
		Name: "Updated Name",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPut, "/profile", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestUpdateProfile_InvalidJSON(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.PUT("/profile", func(c *gin.Context) {
		c.Set("user_id", int64(123))
		handler.UpdateProfile(c)
	})

	req := httptest.NewRequest(http.MethodPut, "/profile", bytes.NewBufferString("invalid json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "error", response["status"])
	assert.Equal(t, "Неверные данные запроса", response["message"])
}

func TestUpdateProfile_EmptyName_NilDB(t *testing.T) {
	// With nil DB, UpdateProfile panics → Recovery returns 500
	handler := setupTestHandler()
	router := gin.New()
	router.Use(gin.Recovery())

	router.PUT("/profile", func(c *gin.Context) {
		c.Set("user_id", int64(123))
		handler.UpdateProfile(c)
	})

	reqBody := UpdateProfileRequest{
		Name: "",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPut, "/profile", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}
