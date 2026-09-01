package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestLoggerMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	log := logger.New()

	t.Run("logs successful request", func(t *testing.T) {
		w := httptest.NewRecorder()
		_, r := gin.CreateTestContext(w)

		r.Use(Logger(log))
		r.GET("/test", func(c *gin.Context) {
			// Verify request_id was set in context
			requestID, exists := c.Get("request_id")
			assert.True(t, exists)
			assert.NotEmpty(t, requestID)

			c.JSON(http.StatusOK, gin.H{"message": "success"})
		})

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("logs request with query parameters", func(t *testing.T) {
		w := httptest.NewRecorder()
		_, r := gin.CreateTestContext(w)

		r.Use(Logger(log))
		r.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "success"})
		})

		req := httptest.NewRequest(http.MethodGet, "/test?page=1&limit=10", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("logs request with user context", func(t *testing.T) {
		w := httptest.NewRecorder()
		_, r := gin.CreateTestContext(w)

		r.Use(Logger(log))
		r.Use(func(c *gin.Context) {
			c.Set("user_id", "user-123")
			c.Next()
		})
		r.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "success"})
		})

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("logs request with errors", func(t *testing.T) {
		w := httptest.NewRecorder()
		_, r := gin.CreateTestContext(w)

		r.Use(Logger(log))
		r.GET("/test", func(c *gin.Context) {
			_ = c.Error(assert.AnError)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "something went wrong"})
		})

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("logs different HTTP methods", func(t *testing.T) {
		methods := []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete}

		for _, method := range methods {
			w := httptest.NewRecorder()
			_, r := gin.CreateTestContext(w)

			r.Use(Logger(log))
			r.Handle(method, "/test", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"message": "success"})
			})

			req := httptest.NewRequest(method, "/test", nil)
			r.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)
		}
	})

	t.Run("logs different status codes", func(t *testing.T) {
		statusCodes := []int{http.StatusOK, http.StatusBadRequest, http.StatusUnauthorized, http.StatusInternalServerError}

		for _, statusCode := range statusCodes {
			w := httptest.NewRecorder()
			_, r := gin.CreateTestContext(w)

			r.Use(Logger(log))
			r.GET("/test", func(c *gin.Context) {
				c.JSON(statusCode, gin.H{"message": "test"})
			})

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			r.ServeHTTP(w, req)

			assert.Equal(t, statusCode, w.Code)
		}
	})
}

// Logs are copied, shipped and kept far longer than any of these credentials
// live, and a token in a log is a token anybody with log access can use.
func TestMaskSecrets(t *testing.T) {
	cases := []struct {
		name  string
		query string
		want  string
	}{
		{"nothing to hide", "date=2026-03-01&limit=50", "date=2026-03-01&limit=50"},
		{"a reset token", "token=abc123", "token=***"},
		{"a websocket ticket", "ticket=xyz", "ticket=***"},
		{"a provider state", "code=auth-code&state=csrf-state", "code=***&state=***"},
		{"mixed with ordinary parameters", "date=2026-03-01&token=secret&limit=5",
			"date=2026-03-01&token=***&limit=5"},
		{"regardless of case", "Token=secret", "Token=***"},
		{"empty", "", ""},
		{"a bare flag has no value to hide", "verbose", "verbose"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, maskSecrets(tc.query))
		})
	}
}

// The parameter name stays: knowing that a request carried a token is useful,
// knowing which token is not.
func TestMaskSecrets_KeepsTheShapeOfTheRequest(t *testing.T) {
	masked := maskSecrets("token=abc&date=2026-03-01")

	assert.Contains(t, masked, "token=")
	assert.NotContains(t, masked, "abc")
	assert.Contains(t, masked, "date=2026-03-01")
}
