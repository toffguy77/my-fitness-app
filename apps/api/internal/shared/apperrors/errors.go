package apperrors

import "errors"

var (
	ErrNotFound           = errors.New("not found")
	ErrUnauthorized       = errors.New("unauthorized")
	ErrForbidden          = errors.New("forbidden")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrTokenInvalid       = errors.New("invalid token")
	ErrTokenExpired       = errors.New("token expired")
	ErrCodeExpired        = errors.New("code expired")
	ErrTooManyAttempts    = errors.New("too many attempts")
	ErrRateLimited        = errors.New("rate limit exceeded")
)
