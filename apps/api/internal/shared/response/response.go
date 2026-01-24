package response

import (
	"github.com/gin-gonic/gin"
)

// Response represents API response structure
type Response struct {
	Status  string      `json:"status"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
}

// Success sends success response
func Success(c *gin.Context, statusCode int, data interface{}) {
	c.JSON(statusCode, Response{
		Status: "success",
		Data:   data,
	})
}

// Error sends error response
func Error(c *gin.Context, statusCode int, message string) {
	c.JSON(statusCode, Response{
		Status:  "error",
		Message: message,
	})
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
