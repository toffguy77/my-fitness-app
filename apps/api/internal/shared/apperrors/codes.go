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
	// Distinct from invalid_credentials on purpose: "your password is wrong"
	// and "the password you typed to confirm it is you is wrong" are different
	// sentences to the person reading them — and the client must be able to
	// tell an expired session from either.
	CodePasswordIncorrect  = "password_incorrect"
	CodeEmailUnavailable   = "email_unavailable"
	CodeConflict           = "conflict"
	CodeGone               = "gone"
	CodeValidation         = "validation"
	CodeFeatureUnavailable = "feature_unavailable"
	// Distinct from token_expired: a refresh will not help, because the token
	// was invalidated deliberately — a password change, or signing out every
	// device. A client that cannot tell them apart either loops refreshing or
	// signs people out whenever a token simply aged.
	CodeSessionEnded = "session_ended"
	CodeInternal     = "internal"
	// CodeRecognitionDailyLimit: distinct from rate_limited — waiting a moment
	// will not help, the ceiling resets tomorrow, not in a few seconds. Named
	// for the domain, not the sentinel: ErrDailyLimitReached is reusable for
	// any daily quota, but the code is what the client shows, and a client
	// reusing the sentinel for, say, a curator-message quota must not inherit
	// a translation about photos.
	CodeRecognitionDailyLimit = "recognition_daily_limit"
	// CodeRecognitionUnclear: the model answered but had nothing usable to
	// say about the photo. Not the client's fault and not a server failure —
	// distinct from both so the client can suggest a retake instead of
	// showing a generic "something broke".
	CodeRecognitionUnclear = "recognition_unclear"
	// CodeRecognitionFailed: a genuine failure (provider outage, timeout) —
	// distinct from CodeRecognitionUnclear so the client can say "try again
	// in a minute" instead of "retake the photo", while still offering the
	// same manual-entry escape hatch.
	CodeRecognitionFailed = "recognition_failed"
	// CodeLeadAlreadyClaimed: the lead queue is shared between coordinators,
	// and marking an already-claimed lead used to answer with the same
	// generic "conflict" as any other clash — a code that translates as
	// "action impossible in the current state" and says nothing about what
	// happened. The sentinel behind it is still the shared ErrConflict
	// (leads.Service.MarkHandled), so this code is not in the map below: the
	// handler, which knows exactly which conflict it is answering, attaches
	// this code directly rather than letting CodeFor pick the generic one.
	CodeLeadAlreadyClaimed = "lead_already_claimed"
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
	ErrFeatureUnavailable: CodeFeatureUnavailable,
	ErrConflict:           CodeConflict,
	ErrGone:               CodeGone,
	ErrValidation:         CodeValidation,
	ErrDailyLimitReached:  CodeRecognitionDailyLimit,
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
	all := make([]string, 0, len(codes)+3)
	for _, code := range codes {
		all = append(all, code)
	}
	// Эти коды ставятся ответами напрямую, без ошибки-сентинела.
	// CodeFeatureUnavailable здесь больше нет: у него появился сентинел
	// apperrors.ErrFeatureUnavailable, и он приходит из карты выше.
	// CodeRecognitionUnclear и CodeRecognitionFailed тоже без сентинела:
	// обработчик распознаёт причину через errors.Is на ошибках пакета llm
	// (или её отсутствие), а не через apperrors.
	// CodeLeadAlreadyClaimed — тем же способом: сентинел один на все
	// конфликты (ErrConflict), а какой именно это конфликт, знает только
	// обработчик MarkHandled.
	return append(all, CodeInternal, CodePasswordIncorrect, CodeSessionEnded,
		CodeRecognitionUnclear, CodeRecognitionFailed, CodeLeadAlreadyClaimed)
}
