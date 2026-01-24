package logger

import (
	"context"
	"os"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Logger wraps zap.SugaredLogger with additional context
type Logger struct {
	*zap.SugaredLogger
	fields map[string]interface{}
}

// LogLevel represents log severity levels
type LogLevel string

const (
	DebugLevel LogLevel = "debug"
	InfoLevel  LogLevel = "info"
	WarnLevel  LogLevel = "warn"
	ErrorLevel LogLevel = "error"
	FatalLevel LogLevel = "fatal"
)

// New creates a new logger instance
func New() *Logger {
	var config zap.Config

	env := os.Getenv("NODE_ENV")
	if env == "production" {
		config = zap.NewProductionConfig()
		// JSON format for production (machine-readable)
		config.Encoding = "json"
	} else {
		config = zap.NewDevelopmentConfig()
		// Console format for development (human-readable)
		config.Encoding = "console"
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	}

	// Add caller information
	config.EncoderConfig.CallerKey = "caller"
	config.EncoderConfig.EncodeCaller = zapcore.ShortCallerEncoder

	// Add stack trace for errors
	config.EncoderConfig.StacktraceKey = "stacktrace"

	logger, err := config.Build(
		zap.AddCaller(),
		zap.AddCallerSkip(1),
		zap.AddStacktrace(zapcore.ErrorLevel),
	)
	if err != nil {
		panic(err)
	}

	return &Logger{
		SugaredLogger: logger.Sugar(),
		fields:        make(map[string]interface{}),
	}
}

// WithContext adds context information to logger
func (l *Logger) WithContext(ctx context.Context) *Logger {
	newLogger := &Logger{
		SugaredLogger: l.SugaredLogger,
		fields:        make(map[string]interface{}),
	}

	// Copy existing fields
	for k, v := range l.fields {
		newLogger.fields[k] = v
	}

	// Extract common context values
	if requestID := ctx.Value("request_id"); requestID != nil {
		newLogger.fields["request_id"] = requestID
	}
	if userID := ctx.Value("user_id"); userID != nil {
		newLogger.fields["user_id"] = userID
	}
	if traceID := ctx.Value("trace_id"); traceID != nil {
		newLogger.fields["trace_id"] = traceID
	}

	return newLogger
}

// WithFields adds structured fields to logger
func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	newLogger := &Logger{
		SugaredLogger: l.SugaredLogger,
		fields:        make(map[string]interface{}),
	}

	// Copy existing fields
	for k, v := range l.fields {
		newLogger.fields[k] = v
	}

	// Add new fields
	for k, v := range fields {
		newLogger.fields[k] = v
	}

	return newLogger
}

// WithField adds a single field to logger
func (l *Logger) WithField(key string, value interface{}) *Logger {
	return l.WithFields(map[string]interface{}{key: value})
}

// WithError adds error information to logger
func (l *Logger) WithError(err error) *Logger {
	if err == nil {
		return l
	}
	return l.WithField("error", err.Error())
}

// Debug logs a debug message
func (l *Logger) Debug(msg string, keysAndValues ...interface{}) {
	l.withFields().Debugw(msg, keysAndValues...)
}

// Info logs an info message
func (l *Logger) Info(msg string, keysAndValues ...interface{}) {
	l.withFields().Infow(msg, keysAndValues...)
}

// Warn logs a warning message
func (l *Logger) Warn(msg string, keysAndValues ...interface{}) {
	l.withFields().Warnw(msg, keysAndValues...)
}

// Error logs an error message
func (l *Logger) Error(msg string, keysAndValues ...interface{}) {
	l.withFields().Errorw(msg, keysAndValues...)
}

// Fatal logs a fatal message and exits
func (l *Logger) Fatal(msg string, keysAndValues ...interface{}) {
	l.withFields().Fatalw(msg, keysAndValues...)
}

// LogHTTPRequest logs HTTP request information
func (l *Logger) LogHTTPRequest(method, path string, statusCode int, duration time.Duration, fields map[string]interface{}) {
	logFields := map[string]interface{}{
		"method":      method,
		"path":        path,
		"status_code": statusCode,
		"duration_ms": duration.Milliseconds(),
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	}

	// Merge with additional fields
	for k, v := range fields {
		logFields[k] = v
	}

	logger := l.WithFields(logFields)

	// Determine log level based on status code
	if statusCode >= 500 {
		logger.Error("HTTP request failed")
	} else if statusCode >= 400 {
		logger.Warn("HTTP request client error")
	} else {
		logger.Info("HTTP request completed")
	}
}

// LogDatabaseQuery logs database query information
func (l *Logger) LogDatabaseQuery(query string, duration time.Duration, err error, fields map[string]interface{}) {
	logFields := map[string]interface{}{
		"query":       query,
		"duration_ms": duration.Milliseconds(),
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	}

	// Merge with additional fields
	for k, v := range fields {
		logFields[k] = v
	}

	logger := l.WithFields(logFields)

	if err != nil {
		logger.WithError(err).Error("Database query failed")
	} else if duration > 1*time.Second {
		logger.Warn("Slow database query")
	} else {
		logger.Debug("Database query executed")
	}
}

// LogBusinessEvent logs business logic events
func (l *Logger) LogBusinessEvent(event string, fields map[string]interface{}) {
	logFields := map[string]interface{}{
		"event":     event,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}

	// Merge with additional fields
	for k, v := range fields {
		logFields[k] = v
	}

	l.WithFields(logFields).Info("Business event")
}

// LogSecurityEvent logs security-related events
func (l *Logger) LogSecurityEvent(event string, severity string, fields map[string]interface{}) {
	logFields := map[string]interface{}{
		"event":     event,
		"severity":  severity,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"category":  "security",
	}

	// Merge with additional fields
	for k, v := range fields {
		logFields[k] = v
	}

	logger := l.WithFields(logFields)

	switch severity {
	case "critical":
		logger.Error("Security event - CRITICAL")
	case "high":
		logger.Warn("Security event - HIGH")
	default:
		logger.Info("Security event")
	}
}

// withFields returns logger with all accumulated fields
func (l *Logger) withFields() *zap.SugaredLogger {
	if len(l.fields) == 0 {
		return l.SugaredLogger
	}

	// Convert fields to key-value pairs
	keysAndValues := make([]interface{}, 0, len(l.fields)*2)
	for k, v := range l.fields {
		keysAndValues = append(keysAndValues, k, v)
	}

	return l.SugaredLogger.With(keysAndValues...)
}

// Sync flushes any buffered log entries
func (l *Logger) Sync() error {
	return l.SugaredLogger.Sync()
}
