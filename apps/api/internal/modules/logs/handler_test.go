package logs

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
)

func setupTestHandler() (*Handler, *gin.Engine) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		Env:  "test",
		Port: 8080,
	}
	log := logger.New()
	handler := NewHandler(cfg, log)
	router := gin.New()
	return handler, router
}

func TestReceiveLogs(t *testing.T) {
	handler, router := setupTestHandler()
	router.POST("/logs", handler.ReceiveLogs)

	t.Run("successful log reception", func(t *testing.T) {
		logs := ReceiveLogsRequest{
			Logs: []LogEntry{
				{
					Level:     "info",
					Message:   "Test log message",
					Timestamp: "2024-01-24T12:00:00Z",
					Context: map[string]interface{}{
						"component": "test",
					},
					UserID:    "user123",
					SessionID: "session456",
					URL:       "https://example.com",
					UserAgent: "Mozilla/5.0",
				},
			},
		}

		body, _ := json.Marshal(logs)
		req := httptest.NewRequest(http.MethodPost, "/logs", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var response map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &response)
		assert.Equal(t, float64(1), response["data"].(map[string]interface{})["received"])
	})

	t.Run("multiple logs", func(t *testing.T) {
		logs := ReceiveLogsRequest{
			Logs: []LogEntry{
				{
					Level:     "debug",
					Message:   "Debug message",
					Timestamp: "2024-01-24T12:00:00Z",
				},
				{
					Level:     "warn",
					Message:   "Warning message",
					Timestamp: "2024-01-24T12:00:01Z",
				},
				{
					Level:     "error",
					Message:   "Error message",
					Timestamp: "2024-01-24T12:00:02Z",
					Error: &ErrorInfo{
						Message: "Something went wrong",
						Name:    "TestError",
					},
					Stack: "Error stack trace",
				},
			},
		}

		body, _ := json.Marshal(logs)
		req := httptest.NewRequest(http.MethodPost, "/logs", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var response map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &response)
		assert.Equal(t, float64(3), response["data"].(map[string]interface{})["received"])
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/logs", bytes.NewBufferString("invalid json"))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("empty logs array", func(t *testing.T) {
		logs := ReceiveLogsRequest{
			Logs: []LogEntry{},
		}

		body, _ := json.Marshal(logs)
		req := httptest.NewRequest(http.MethodPost, "/logs", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("log with all levels", func(t *testing.T) {
		levels := []string{"debug", "info", "warn", "error", "fatal"}
		var logEntries []LogEntry

		for _, level := range levels {
			logEntries = append(logEntries, LogEntry{
				Level:     level,
				Message:   "Test " + level + " message",
				Timestamp: "2024-01-24T12:00:00Z",
			})
		}

		logs := ReceiveLogsRequest{Logs: logEntries}
		body, _ := json.Marshal(logs)
		req := httptest.NewRequest(http.MethodPost, "/logs", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestGetLogStats(t *testing.T) {
	handler, router := setupTestHandler()
	router.GET("/logs/stats", handler.GetLogStats)

	t.Run("returns stats", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/logs/stats", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var response map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &response)
		assert.NotNil(t, response["data"])
	})
}
