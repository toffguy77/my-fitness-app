package apperrors

import "errors"

// Codes are machine-readable names for the failures the API reports.
//
// The API used to answer in Russian prose: every client had to display it as-is
// or match on substrings to work out what happened. A code lets each client
// decide how to say it — and lets a second client exist at all.
const (
	CodeNotFound           = "not_found"
	CodeUnauthorized       = "unauthorized"
	CodeForbidden          = "forbidden"
	CodeInvalidCredentials = "invalid_credentials"
	CodeTokenInvalid       = "token_invalid"
	CodeTokenExpired       = "token_expired"
	CodeCodeExpired        = "code_expired"
	CodeTooManyAttempts    = "too_many_attempts"
	CodeRateLimited        = "rate_limited"
	CodeUnsupportedMedia   = "unsupported_media"
	CodePasswordPolicy     = "password_policy"
	CodePasswordUnchanged  = "password_unchanged"
	CodeEmailUnavailable   = "email_unavailable"
	CodeConflict           = "conflict"
	CodeGone               = "gone"
	CodeValidation         = "validation"
	CodeFeatureUnavailable = "feature_unavailable"
	CodeInternal           = "internal"
)

// codes maps each declared error to its code. A sentinel absent from this map
// reports as CodeInternal, which is the honest answer: the client cannot act on
// something we never named.
var codes = map[error]string{
	ErrNotFound:           CodeNotFound,
	ErrUnauthorized:       CodeUnauthorized,
	ErrForbidden:          CodeForbidden,
	ErrInvalidCredentials: CodeInvalidCredentials,
	ErrTokenInvalid:       CodeTokenInvalid,
	ErrTokenExpired:       CodeTokenExpired,
	ErrCodeExpired:        CodeCodeExpired,
	ErrTooManyAttempts:    CodeTooManyAttempts,
	ErrRateLimited:        CodeRateLimited,
	ErrUnsupportedMedia:   CodeUnsupportedMedia,
	ErrPasswordPolicy:     CodePasswordPolicy,
	ErrPasswordUnchanged:  CodePasswordUnchanged,
	ErrEmailUnavailable:   CodeEmailUnavailable,
	ErrConflict:           CodeConflict,
	ErrGone:               CodeGone,
	ErrValidation:         CodeValidation,
}

// CodeFor returns the code for an error, following wrapping.
func CodeFor(err error) string {
	for sentinel, code := range codes {
		if errors.Is(err, sentinel) {
			return code
		}
	}
	return CodeInternal
}

// AllCodes lists every code the API can return, so the clients' dictionaries
// can be checked for completeness rather than trusted.
func AllCodes() []string {
	all := make([]string, 0, len(codes)+2)
	for _, code := range codes {
		all = append(all, code)
	}
	return append(all, CodeFeatureUnavailable, CodeInternal)
}
