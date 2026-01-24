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
			c.Error(assert.AnError)
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
