package middleware

import (
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Logger middleware logs HTTP requests with detailed information
func Logger(log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Use client-provided request ID for cross-layer tracing, or generate one
		requestID := c.GetHeader("X-Request-Id")
		if requestID == "" {
			requestID = uuid.New().String()
		}
		c.Set("request_id", requestID)
		c.Header("X-Request-Id", requestID)

		// Start timer
		start := time.Now()

		// Get request information
		method := c.Request.Method
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery
		ip := c.ClientIP()
		userAgent := c.Request.UserAgent()

		// Process request
		c.Next()

		// Calculate duration
		duration := time.Since(start)

		// Get response information
		statusCode := c.Writer.Status()
		bodySize := c.Writer.Size()

		// Get user ID if authenticated
		userID, _ := c.Get("user_id")

		// Prepare log fields
		fields := map[string]interface{}{
			"request_id": requestID,
			"ip":         ip,
			"user_agent": userAgent,
			"body_size":  bodySize,
		}

		// Preserve client-generated request ID for cross-proxy tracing
		if clientReqID := c.GetHeader("X-Client-Request-Id"); clientReqID != "" {
			fields["client_request_id"] = clientReqID
		}

		if query != "" {
			fields["query"] = query
		}

		if userID != nil {
			fields["user_id"] = userID
		}

		// Check for errors
		if len(c.Errors) > 0 {
			fields["errors"] = c.Errors.String()
		}

		// Log the request
		log.LogHTTPRequest(method, path, statusCode, duration, fields)
	}
}
