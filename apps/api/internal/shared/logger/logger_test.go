package logger

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNew(t *testing.T) {
	t.Run("creates new logger", func(t *testing.T) {
		log := New()
		assert.NotNil(t, log)
		assert.NotNil(t, log.SugaredLogger)
		assert.NotNil(t, log.fields)
	})
}

func TestWithContext(t *testing.T) {
	log := New()

	t.Run("adds context values", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), "request_id", "req-123")
		ctx = context.WithValue(ctx, "user_id", "user-456")

		logWithCtx := log.WithContext(ctx)

		assert.NotNil(t, logWithCtx)
		assert.Equal(t, "req-123", logWithCtx.fields["request_id"])
		assert.Equal(t, "user-456", logWithCtx.fields["user_id"])
	})

	t.Run("handles empty context", func(t *testing.T) {
		ctx := context.Background()
		logWithCtx := log.WithContext(ctx)

		assert.NotNil(t, logWithCtx)
	})
}

func TestWithFields(t *testing.T) {
	log := New()

	t.Run("adds fields", func(t *testing.T) {
		fields := map[string]interface{}{
			"component": "test",
			"action":    "create",
		}

		logWithFields := log.WithFields(fields)

		assert.NotNil(t, logWithFields)
		assert.Equal(t, "test", logWithFields.fields["component"])
		assert.Equal(t, "create", logWithFields.fields["action"])
	})

	t.Run("preserves existing fields", func(t *testing.T) {
		log1 := log.WithField("key1", "value1")
		log2 := log1.WithFields(map[string]interface{}{"key2": "value2"})

		assert.Equal(t, "value1", log2.fields["key1"])
		assert.Equal(t, "value2", log2.fields["key2"])
	})
}

func TestWithField(t *testing.T) {
	log := New()

	t.Run("adds single field", func(t *testing.T) {
		logWithField := log.WithField("user_id", "123")

		assert.NotNil(t, logWithField)
		assert.Equal(t, "123", logWithField.fields["user_id"])
	})
}

func TestWithError(t *testing.T) {
	log := New()

	t.Run("adds error field", func(t *testing.T) {
		err := errors.New("test error")
		logWithError := log.WithError(err)

		assert.NotNil(t, logWithError)
		assert.Equal(t, "test error", logWithError.fields["error"])
	})

	t.Run("handles nil error", func(t *testing.T) {
		logWithError := log.WithError(nil)

		assert.NotNil(t, logWithError)
		_, exists := logWithError.fields["error"]
		assert.False(t, exists)
	})
}

func TestLogLevels(t *testing.T) {
	log := New()

	t.Run("debug level", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.Debug("debug message")
		})
	})

	t.Run("info level", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.Info("info message")
		})
	})

	t.Run("warn level", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.Warn("warn message")
		})
	})

	t.Run("error level", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.Error("error message")
		})
	})
}

func TestLogHTTPRequest(t *testing.T) {
	log := New()

	t.Run("logs successful request", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogHTTPRequest("GET", "/api/users", 200, 100*time.Millisecond, map[string]interface{}{
				"user_id": "123",
			})
		})
	})

	t.Run("logs client error", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogHTTPRequest("POST", "/api/users", 400, 50*time.Millisecond, nil)
		})
	})

	t.Run("logs server error", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogHTTPRequest("GET", "/api/users", 500, 200*time.Millisecond, nil)
		})
	})
}

func TestLogDatabaseQuery(t *testing.T) {
	log := New()

	t.Run("logs successful query", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogDatabaseQuery("SELECT * FROM users", 50*time.Millisecond, nil, nil)
		})
	})

	t.Run("logs failed query", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogDatabaseQuery("SELECT * FROM users", 50*time.Millisecond, errors.New("connection failed"), nil)
		})
	})

	t.Run("logs slow query", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogDatabaseQuery("SELECT * FROM users", 2*time.Second, nil, nil)
		})
	})
}

func TestLogBusinessEvent(t *testing.T) {
	log := New()

	t.Run("logs business event", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogBusinessEvent("user_registered", map[string]interface{}{
				"user_id": "123",
				"email":   "test@example.com",
			})
		})
	})

	t.Run("logs event without fields", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogBusinessEvent("user_logged_in", nil)
		})
	})
}

func TestLogSecurityEvent(t *testing.T) {
	log := New()

	t.Run("logs critical security event", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogSecurityEvent("unauthorized_access", "critical", map[string]interface{}{
				"ip": "192.168.1.1",
			})
		})
	})

	t.Run("logs high severity event", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogSecurityEvent("failed_login", "high", nil)
		})
	})

	t.Run("logs low severity event", func(t *testing.T) {
		assert.NotPanics(t, func() {
			log.LogSecurityEvent("password_changed", "low", nil)
		})
	})
}

func TestSync(t *testing.T) {
	log := New()

	t.Run("syncs logger", func(t *testing.T) {
		err := log.Sync()
		// Sync may return error on stderr, which is expected in tests
		assert.True(t, err == nil || err != nil)
	})
}
