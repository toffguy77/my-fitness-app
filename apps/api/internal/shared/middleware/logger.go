package middleware

import (
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
)

// Logger middleware logs HTTP requests
func Logger(log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		duration := time.Since(start)
		statusCode := c.Writer.Status()

		log.Infow("HTTP request",
			"method", c.Request.Method,
			"path", path,
			"query", query,
			"status", statusCode,
			"duration", duration.String(),
			"ip", c.ClientIP(),
		)
	}
}
