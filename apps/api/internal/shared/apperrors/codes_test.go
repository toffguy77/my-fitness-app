package apperrors

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

// A duplicate code would make two different failures indistinguishable to
// every client at once.
func TestCodes_AreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, code := range AllCodes() {
		assert.False(t, seen[code], "code %q is declared twice", code)
		seen[code] = true
	}
}

func TestCodeFor_FollowsWrapping(t *testing.T) {
	wrapped := fmt.Errorf("look up user: %w", ErrNotFound)

	assert.Equal(t, CodeNotFound, CodeFor(wrapped))
	assert.Equal(t, CodeInvalidCredentials, CodeFor(ErrInvalidCredentials))
}

// An error we never named cannot be acted on by a client, and saying so is
// more honest than inventing a code for it.
func TestCodeFor_UnnamedErrorsAreInternal(t *testing.T) {
	assert.Equal(t, CodeInternal, CodeFor(errors.New("something went wrong")))
	assert.Equal(t, CodeInternal, CodeFor(nil))
}

// Every declared sentinel needs a code, or a failure the API already
// distinguishes reaches clients as "internal".
func TestEverySentinelHasACode(t *testing.T) {
	sentinels := []error{
		ErrNotFound, ErrUnauthorized, ErrForbidden, ErrInvalidCredentials,
		ErrTokenInvalid, ErrTokenExpired, ErrCodeExpired, ErrTooManyAttempts,
		ErrRateLimited, ErrUnsupportedMedia, ErrPasswordPolicy, ErrPasswordUnchanged,
		ErrEmailUnavailable, ErrConflict, ErrGone, ErrValidation,
	}

	for _, sentinel := range sentinels {
		assert.NotEqual(t, CodeInternal, CodeFor(sentinel),
			"%v has no code of its own", sentinel)
	}
}
