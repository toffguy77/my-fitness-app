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
	ErrUnsupportedMedia   = errors.New("unsupported media type")
	ErrPasswordPolicy     = errors.New("password does not meet policy")
	ErrPasswordUnchanged  = errors.New("new password must differ from the current one")
	ErrEmailUnavailable   = errors.New("email delivery is not configured")
	// ErrFeatureUnavailable: возможность выключена, потому что для неё не
	// заданы учётные данные. Это не поломка, и отвечать на неё 500 — значит
	// сказать вызывающему «сломалось у нас» и предложить повторить запрос,
	// который не может получиться.
	ErrFeatureUnavailable = errors.New("feature is not configured")
	ErrConflict           = errors.New("conflicting state")
	ErrGone               = errors.New("no longer available")
	ErrValidation         = errors.New("invalid input")
)
