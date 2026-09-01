package users

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// A disabled capability must answer 503 before touching the request body — an
// unconfigured bucket used to surface as a 500 from deep inside the service.
func TestUploadAvatar_CapabilityDisabled(t *testing.T) {
	handler := setupTestHandler() // Features zero-valued: avatars disabled

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/users/avatar", nil)

	handler.UploadAvatar(c)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}
