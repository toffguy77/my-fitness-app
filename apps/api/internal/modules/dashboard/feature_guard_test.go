package dashboard

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// Progress photos are optional: without the bucket configured the endpoint
// must decline with 503 instead of failing during upload.
func TestUploadPhoto_CapabilityDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := &Handler{
		cfg: &config.Config{Env: "test"}, // Features zero-valued: photos disabled
		log: logger.New(),
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/dashboard/photo-upload", nil)

	handler.UploadPhoto(c)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}
