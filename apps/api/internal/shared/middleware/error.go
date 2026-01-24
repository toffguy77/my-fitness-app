package middleware

import (
	"net/http"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// ErrorHandler middleware handles errors
func ErrorHandler(log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// Check if there are any errors
		if len(c.Errors) > 0 {
			err := c.Errors.Last()

			log.Errorw("Request error",
				"error", err.Error(),
				"path", c.Request.URL.Path,
				"method", c.Request.Method,
			)

			// If response not already written
			if !c.Writer.Written() {
				response.Error(c, http.StatusInternalServerError, "Internal server error")
			}
		}
	}
}
