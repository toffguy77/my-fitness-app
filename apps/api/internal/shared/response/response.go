package response

import (
	"net/http"

	"github.com/burcev/api/internal/shared/apperrors"

	"github.com/gin-gonic/gin"
)

// Response represents API response structure
type Response struct {
	Status string      `json:"status"`
	Data   interface{} `json:"data,omitempty"`
	// Message is the human-readable text. Kept while the clients still fall
	// back to it; the code below is what they should read.
	Message string `json:"message,omitempty"`
	// Code names the failure in a way a client can act on. The API used to
	// answer in Russian prose, which meant every client either displayed it
	// verbatim or matched on substrings to work out what had happened.
	Code string `json:"code,omitempty"`
	// Params carry the values a translated message needs, when it needs any.
	Params map[string]any `json:"params,omitempty"`
}

// Success sends success response
func Success(c *gin.Context, statusCode int, data interface{}) {
	c.JSON(statusCode, Response{
		Status: "success",
		Data:   data,
	})
}

// Error sends error response.
//
// The code is derived from the status when the caller does not name one, so
// every error carries something machine-readable even before its handler has
// been migrated.
func Error(c *gin.Context, statusCode int, message string) {
	c.JSON(statusCode, Response{
		Status:  "error",
		Message: message,
		Code:    codeForStatus(statusCode),
	})
}

// ErrorCode sends an error naming what happened, with the parameters a
// translated message may need.
func ErrorCode(c *gin.Context, statusCode int, code, message string, params map[string]any) {
	c.JSON(statusCode, Response{
		Status:  "error",
		Message: message,
		Code:    code,
		Params:  params,
	})
}

// Fail sends an error derived from a typed error, so the code and the status
// agree without the handler restating both.
func Fail(c *gin.Context, statusCode int, err error, message string) {
	ErrorCode(c, statusCode, apperrors.CodeFor(err), message, nil)
}

// codeForStatus is the fallback for handlers that have not been migrated.
func codeForStatus(status int) string {
	switch status {
	case http.StatusUnauthorized:
		return apperrors.CodeUnauthorized
	case http.StatusForbidden:
		return apperrors.CodeForbidden
	case http.StatusNotFound:
		return apperrors.CodeNotFound
	case http.StatusConflict:
		return apperrors.CodeConflict
	case http.StatusGone:
		return apperrors.CodeGone
	case http.StatusTooManyRequests:
		return apperrors.CodeRateLimited
	case http.StatusUnsupportedMediaType:
		return apperrors.CodeUnsupportedMedia
	case http.StatusServiceUnavailable:
		return apperrors.CodeFeatureUnavailable
	case http.StatusBadRequest:
		return apperrors.CodeValidation
	default:
		return apperrors.CodeInternal
	}
}

// SuccessWithMessage sends success response with message
func SuccessWithMessage(c *gin.Context, statusCode int, message string, data interface{}) {
	c.JSON(statusCode, Response{
		Status:  "success",
		Message: message,
		Data:    data,
	})
}

// Unauthorized sends unauthorized response
func Unauthorized(c *gin.Context, message string) {
	Error(c, 401, message)
}

// Forbidden sends forbidden response
func Forbidden(c *gin.Context, message string) {
	Error(c, 403, message)
}

// NotFound sends not found response
func NotFound(c *gin.Context, message string) {
	Error(c, 404, message)
}

// InternalError sends internal server error response
func InternalError(c *gin.Context, message string) {
	Error(c, 500, message)
}

// FeatureUnavailable reports that an optional capability is switched off in
// this environment. Every disabled capability answers the same way, so clients
// can handle one shape instead of guessing from a nil-pointer 500.
func FeatureUnavailable(c *gin.Context, message string) {
	Error(c, http.StatusServiceUnavailable, message)
}
