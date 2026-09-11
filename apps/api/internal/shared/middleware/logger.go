package middleware

import (
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Logger middleware logs HTTP requests with detailed information
func Logger(log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// The identifier is the tracing middleware's, so a log line and a span
		// carry the same one. Generated here only when that middleware is not
		// in the chain, which is the case in a handler's own tests.
		requestID, _ := c.Get("request_id")
		if requestID == nil || requestID == "" {
			requestID = c.GetHeader(RequestIDHeader)
			if requestID == "" {
				requestID = uuid.New().String()
			}
			c.Set("request_id", requestID)
			c.Header(RequestIDHeader, requestID.(string))
		}

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
		} else if sent, ok := c.Get("client_request_id"); ok && sent != requestID {
			fields["client_request_id"] = sent
		}

		if query != "" {
			fields["query"] = maskSecrets(query)
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

// secretParams are query parameters whose values must never reach a log.
//
// Every one of them is a credential that arrives in a URL: a password reset
// token, a WebSocket ticket, a sign-in state. Logs are copied, shipped and kept
// far longer than any of these live, and a token in a log is a token anybody
// with log access can use.
var secretParams = map[string]struct{}{
	"token":         {},
	"ticket":        {},
	"refresh_token": {},
	"code":          {},
	"state":         {},
	"password":      {},
	"access_token":  {},
	"secret":        {},
}

// maskSecrets replaces the values of sensitive query parameters.
//
// The parameter names are kept: knowing that a request carried a token is
// useful, and knowing which token is not.
func maskSecrets(rawQuery string) string {
	if rawQuery == "" {
		return rawQuery
	}

	parts := strings.Split(rawQuery, "&")
	for i, part := range parts {
		name, _, found := strings.Cut(part, "=")
		if !found {
			continue
		}
		if _, secret := secretParams[strings.ToLower(name)]; secret {
			parts[i] = name + "=***"
		}
	}
	return strings.Join(parts, "&")
}
