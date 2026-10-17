package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Проверки до обращения к базе. Хранилище здесь без базы (nil): тронь его
// middleware — тест упадёт паникой, и это часть проверки «таблица не
// меняется».

func idempotencyEngineWithoutDB(t *testing.T, calls *int) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/thing", func(c *gin.Context) {
		if c.GetHeader("X-No-User") == "" {
			c.Set("user_id", int64(7))
		}
		c.Next()
	}, Idempotency(nil, logger.New()), func(c *gin.Context) {
		*calls++
		c.JSON(http.StatusCreated, gin.H{"ok": true})
	})
	return engine
}

func TestIdempotency_БезЗаголовкаПоведениеПрежнее(t *testing.T) {
	calls := 0
	engine := idempotencyEngineWithoutDB(t, &calls)

	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/thing", strings.NewReader(`{"a":1}`)))
		require.Equal(t, http.StatusCreated, w.Code)
		assert.Empty(t, w.Header().Get(IdempotentReplayedHeader))
	}
	assert.Equal(t, 2, calls, "без ключа каждый запрос выполняется")
}

func TestIdempotency_КлючНеUUIDОтклоняется(t *testing.T) {
	for _, key := range []string{
		"not-a-uuid",
		"123",
		"urn:uuid:3f0c5a6e-4a0b-4c47-9d38-3b7ac1f6a3e1",
		"{3f0c5a6e-4a0b-4c47-9d38-3b7ac1f6a3e1}",
	} {
		t.Run(key, func(t *testing.T) {
			calls := 0
			engine := idempotencyEngineWithoutDB(t, &calls)
			req := httptest.NewRequest(http.MethodPost, "/thing", strings.NewReader(`{}`))
			req.Header.Set(IdempotencyKeyHeader, key)
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, req)

			require.Equal(t, http.StatusBadRequest, w.Code)
			var body map[string]any
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
			assert.Equal(t, "validation", body["code"])
			assert.Zero(t, calls)
		})
	}
}

func TestIdempotency_БезПользователяНеВыполняется(t *testing.T) {
	calls := 0
	engine := idempotencyEngineWithoutDB(t, &calls)
	req := httptest.NewRequest(http.MethodPost, "/thing", strings.NewReader(`{}`))
	req.Header.Set(IdempotencyKeyHeader, "3f0c5a6e-4a0b-4c47-9d38-3b7ac1f6a3e1")
	req.Header.Set("X-No-User", "1")
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Zero(t, calls)
}
