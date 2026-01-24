package response

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func setupTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	return gin.New()
}

func TestSuccess(t *testing.T) {
	router := setupTestRouter()
	router.GET("/test", func(c *gin.Context) {
		Success(c, http.StatusOK, gin.H{"message": "success"})
	})

	t.Run("returns success response", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "success")
		assert.Contains(t, w.Body.String(), "\"status\":\"success\"")
	})
}

func TestError(t *testing.T) {
	router := setupTestRouter()
	router.GET("/test", func(c *gin.Context) {
		Error(c, http.StatusBadRequest, "validation error")
	})

	t.Run("returns error response", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assert.Contains(t, w.Body.String(), "validation error")
		assert.Contains(t, w.Body.String(), "\"status\":\"error\"")
	})
}

func TestUnauthorized(t *testing.T) {
	router := setupTestRouter()
	router.GET("/test", func(c *gin.Context) {
		Unauthorized(c, "invalid token")
	})

	t.Run("returns unauthorized response", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assert.Contains(t, w.Body.String(), "invalid token")
	})
}

func TestForbidden(t *testing.T) {
	router := setupTestRouter()
	router.GET("/test", func(c *gin.Context) {
		Forbidden(c, "insufficient permissions")
	})

	t.Run("returns forbidden response", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "insufficient permissions")
	})
}

func TestNotFound(t *testing.T) {
	router := setupTestRouter()
	router.GET("/test", func(c *gin.Context) {
		NotFound(c, "resource not found")
	})

	t.Run("returns not found response", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assert.Contains(t, w.Body.String(), "resource not found")
	})
}

func TestInternalError(t *testing.T) {
	router := setupTestRouter()
	router.GET("/test", func(c *gin.Context) {
		InternalError(c, "database connection failed")
	})

	t.Run("returns internal error response", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
		assert.Contains(t, w.Body.String(), "database connection failed")
	})
}
