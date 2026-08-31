package content

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// Media upload is optional: without the content bucket configured the endpoint
// must decline with 503 before parsing the multipart body.
func TestUploadMedia_CapabilityDisabled(t *testing.T) {
	handler, _ := setupContentTestHandler() // Features zero-valued: media disabled

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Params = gin.Params{{Key: "id", Value: "00000000-0000-0000-0000-000000000001"}}
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/content/1/media", nil)

	handler.UploadMedia(c)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}
