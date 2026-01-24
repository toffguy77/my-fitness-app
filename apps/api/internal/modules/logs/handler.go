package logs

import (
	"net/http"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler handles log requests from frontend
type Handler struct {
	cfg *config.Config
	log *logger.Logger
}

// NewHandler creates a new logs handler
func NewHandler(cfg *config.Config, log *logger.Logger) *Handler {
	return &Handler{
		cfg: cfg,
		log: log,
	}
}

// LogEntry represents a frontend log entry
type LogEntry struct {
	Level     string                 `json:"level"`
	Message   string                 `json:"message"`
	Timestamp string                 `json:"timestamp"`
	Context   map[string]interface{} `json:"context,omitempty"`
	Error     *ErrorInfo             `json:"error,omitempty"`
	Stack     string                 `json:"stack,omitempty"`
	UserAgent string                 `json:"userAgent,omitempty"`
	URL       string                 `json:"url,omitempty"`
	UserID    string                 `json:"userId,omitempty"`
	SessionID string                 `json:"sessionId,omitempty"`
	RequestID string                 `json:"requestId,omitempty"`
}

// ErrorInfo represents error information
type ErrorInfo struct {
	Message string `json:"message"`
	Name    string `json:"name"`
}

// ReceiveLogsRequest represents the request body for receiving logs
type ReceiveLogsRequest struct {
	Logs []LogEntry `json:"logs" binding:"required"`
}

// ReceiveLogs receives and processes logs from frontend
func (h *Handler) ReceiveLogs(c *gin.Context) {
	var req ReceiveLogsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request data")
		return
	}

	// Get request metadata
	clientIP := c.ClientIP()
	requestID, _ := c.Get("request_id")

	// Process each log entry
	for _, entry := range req.Logs {
		// Enrich log with server-side information
		fields := map[string]interface{}{
			"source":     "frontend",
			"client_ip":  clientIP,
			"session_id": entry.SessionID,
			"url":        entry.URL,
			"user_agent": entry.UserAgent,
		}

		if requestID != nil {
			fields["request_id"] = requestID
		}

		if entry.UserID != "" {
			fields["user_id"] = entry.UserID
		}

		// Add context fields
		for k, v := range entry.Context {
			fields[k] = v
		}

		// Parse timestamp
		timestamp, err := time.Parse(time.RFC3339, entry.Timestamp)
		if err == nil {
			fields["client_timestamp"] = timestamp
		}

		// Create logger with fields
		logWithFields := h.log.WithFields(fields)

		// Add error if present
		if entry.Error != nil {
			logWithFields = logWithFields.WithField("error_message", entry.Error.Message)
			if entry.Stack != "" {
				logWithFields = logWithFields.WithField("stack_trace", entry.Stack)
			}
		}

		// Log based on level
		message := entry.Message
		switch entry.Level {
		case "debug":
			logWithFields.Debug(message)
		case "info":
			logWithFields.Info(message)
		case "warn":
			logWithFields.Warn(message)
		case "error":
			logWithFields.Error(message)
		case "fatal":
			logWithFields.Error(message) // Don't actually fatal on frontend errors
		default:
			logWithFields.Info(message)
		}
	}

	response.Success(c, http.StatusOK, gin.H{
		"received": len(req.Logs),
	})
}

// GetLogStats returns logging statistics (for monitoring)
func (h *Handler) GetLogStats(c *gin.Context) {
	// This would typically query a database or metrics system
	// For now, return a placeholder
	stats := gin.H{
		"status": "operational",
		"info":   "Log collection is active",
	}

	response.Success(c, http.StatusOK, stats)
}
