package chat

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// Attachment upload is optional: without the chat bucket configured the
// endpoint must decline with 503 rather than fail inside the S3 client.
func TestUploadAttachment_CapabilityDisabled(t *testing.T) {
	handler, _ := setupChatHandlerTest() // Features zero-valued: attachments disabled

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("user_id", int64(1))
	c.Params = gin.Params{{Key: "id", Value: "conv-1"}}
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/conversations/conv-1/upload", nil)

	handler.UploadAttachment(c)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}
