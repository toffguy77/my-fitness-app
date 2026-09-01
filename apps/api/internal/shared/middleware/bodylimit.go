package middleware

import (
	"net/http"

	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// MaxBodyBytes caps any request body. It sits above the largest per-endpoint
// upload limit (10 MB) with room for multipart overhead, so a legitimate upload
// is never cut off here — this is a backstop for endpoints that never thought
// about body size at all.
const MaxBodyBytes = 12 * 1024 * 1024

// BodyLimit rejects oversized request bodies before a handler reads them.
func BodyLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxBytes {
			response.Error(c, http.StatusRequestEntityTooLarge,
				"Тело запроса слишком большое")
			c.Abort()
			return
		}
		// ContentLength can be absent or understated, so the reader enforces
		// the limit as the body is consumed.
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}
