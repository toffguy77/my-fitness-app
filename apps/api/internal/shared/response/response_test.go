package response

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

// Every error carries something a client can act on, even from a handler that
// still writes its own Russian sentence: the code comes from the status.
func TestError_CarriesACodeDerivedFromTheStatus(t *testing.T) {
	cases := map[int]string{
		http.StatusUnauthorized:         apperrors.CodeUnauthorized,
		http.StatusForbidden:            apperrors.CodeForbidden,
		http.StatusNotFound:             apperrors.CodeNotFound,
		http.StatusConflict:             apperrors.CodeConflict,
		http.StatusGone:                 apperrors.CodeGone,
		http.StatusTooManyRequests:      apperrors.CodeRateLimited,
		http.StatusUnsupportedMediaType: apperrors.CodeUnsupportedMedia,
		http.StatusServiceUnavailable:   apperrors.CodeFeatureUnavailable,
		http.StatusBadRequest:           apperrors.CodeValidation,
		http.StatusInternalServerError:  apperrors.CodeInternal,
	}

	for status, want := range cases {
		t.Run(want, func(t *testing.T) {
			router := setupTestRouter()
			router.GET("/test", func(c *gin.Context) {
				Error(c, status, "текст для человека")
			})

			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/test", nil))

			var body Response
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
			assert.Equal(t, want, body.Code)
			// The text stays while clients still fall back to it.
			assert.Equal(t, "текст для человека", body.Message)
		})
	}
}

// A translated message needs the values it interpolates, and inventing them
// client-side is how "3 попытки" becomes "3 попыток".
func TestErrorCode_CarriesParameters(t *testing.T) {
	router := setupTestRouter()
	router.GET("/test", func(c *gin.Context) {
		ErrorCode(c, http.StatusTooManyRequests, apperrors.CodeTooManyAttempts,
			"Слишком много попыток", map[string]any{"retry_after_seconds": 60})
	})

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/test", nil))

	var body Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, apperrors.CodeTooManyAttempts, body.Code)
	assert.EqualValues(t, 60, body.Params["retry_after_seconds"])
}

// The code follows the typed error, so a handler states the failure once.
func TestFail_TakesTheCodeFromTheError(t *testing.T) {
	router := setupTestRouter()
	router.GET("/test", func(c *gin.Context) {
		Fail(c, http.StatusBadRequest,
			fmt.Errorf("reset: %w", apperrors.ErrPasswordPolicy), "Пароль слишком простой")
	})

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/test", nil))

	var body Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, apperrors.CodePasswordPolicy, body.Code)
}
