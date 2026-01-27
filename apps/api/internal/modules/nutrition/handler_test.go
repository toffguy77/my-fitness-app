package nutrition

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
	return NewHandler(cfg, log)
}

func TestNewHandler(t *testing.T) {
	handler := setupTestHandler()
	assert.NotNil(t, handler)
	assert.NotNil(t, handler.cfg)
	assert.NotNil(t, handler.log)
	assert.NotNil(t, handler.service)
}

func TestGetEntries(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.GET("/entries", func(c *gin.Context) {
		c.Set("user_id", "test-user-123")
		handler.GetEntries(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/entries", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	entries := data["entries"].([]interface{})
	assert.NotEmpty(t, entries)
}

func TestCreateEntry_Success(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.POST("/entries", func(c *gin.Context) {
		c.Set("user_id", "test-user-123")
		handler.CreateEntry(c)
	})

	reqBody := CreateEntryRequest{
		Date:     "2026-01-26",
		Meal:     "breakfast",
		Food:     "Oatmeal",
		Calories: 150,
		Protein:  5,
		Carbs:    27,
		Fat:      3,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/entries", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	entry := data["entry"].(map[string]interface{})
	assert.Equal(t, "Oatmeal", entry["food"])
	assert.Equal(t, 150.0, entry["calories"])
}

func TestCreateEntry_MissingRequiredFields(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.POST("/entries", func(c *gin.Context) {
		c.Set("user_id", "test-user-123")
		handler.CreateEntry(c)
	})

	tests := []struct {
		name string
		body map[string]interface{}
	}{
		{
			name: "Missing date",
			body: map[string]interface{}{
				"meal":     "breakfast",
				"food":     "Oatmeal",
				"calories": 150,
			},
		},
		{
			name: "Missing meal",
			body: map[string]interface{}{
				"date":     "2026-01-26",
				"food":     "Oatmeal",
				"calories": 150,
			},
		},
		{
			name: "Missing food",
			body: map[string]interface{}{
				"date":     "2026-01-26",
				"meal":     "breakfast",
				"calories": 150,
			},
		},
		{
			name: "Missing calories",
			body: map[string]interface{}{
				"date": "2026-01-26",
				"meal": "breakfast",
				"food": "Oatmeal",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/entries", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusBadRequest, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			assert.Equal(t, "error", response["status"])
			assert.Equal(t, "Invalid request data", response["message"])
		})
	}
}

func TestCreateEntry_InvalidJSON(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.POST("/entries", func(c *gin.Context) {
		c.Set("user_id", "test-user-123")
		handler.CreateEntry(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/entries", bytes.NewBufferString("invalid json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetEntry(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.GET("/entries/:id", func(c *gin.Context) {
		c.Set("user_id", "test-user-123")
		handler.GetEntry(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/entries/entry-123", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	entry := data["entry"].(map[string]interface{})
	assert.Equal(t, "entry-123", entry["id"])
}

func TestUpdateEntry_Success(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.PUT("/entries/:id", func(c *gin.Context) {
		c.Set("user_id", "test-user-123")
		handler.UpdateEntry(c)
	})

	reqBody := CreateEntryRequest{
		Date:     "2026-01-26",
		Meal:     "lunch",
		Food:     "Updated Food",
		Calories: 200,
		Protein:  10,
		Carbs:    30,
		Fat:      5,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPut, "/entries/entry-123", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	entry := data["entry"].(map[string]interface{})
	assert.Equal(t, "Updated Food", entry["food"])
}

func TestUpdateEntry_InvalidJSON(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.PUT("/entries/:id", func(c *gin.Context) {
		c.Set("user_id", "test-user-123")
		handler.UpdateEntry(c)
	})

	req := httptest.NewRequest(http.MethodPut, "/entries/entry-123", bytes.NewBufferString("invalid"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestDeleteEntry(t *testing.T) {
	handler := setupTestHandler()
	router := gin.New()

	router.DELETE("/entries/:id", func(c *gin.Context) {
		c.Set("user_id", "test-user-123")
		handler.DeleteEntry(c)
	})

	req := httptest.NewRequest(http.MethodDelete, "/entries/entry-123", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	assert.Equal(t, "Entry deleted successfully", response["message"])
}
