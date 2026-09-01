package leads

import (
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "a-secret-of-sufficient-length-for-hmac"

func TestResumeToken_RoundTrips(t *testing.T) {
	token := signToken(testSecret, "lead-1", time.Now().Add(time.Hour))

	id, err := parseToken(testSecret, token)

	require.NoError(t, err)
	assert.Equal(t, "lead-1", id)
}

// A bare identifier in a link would let anyone walk the table and read
// strangers' body measurements, so every one of these must be refused.
func TestResumeToken_RefusesAnythingNotMinted(t *testing.T) {
	valid := signToken(testSecret, "lead-1", time.Now().Add(time.Hour))
	parts := strings.Split(valid, ".")

	cases := []struct {
		name  string
		token string
		want  error
	}{
		{"a bare identifier", "lead-1", apperrors.ErrTokenInvalid},
		{"empty", "", apperrors.ErrTokenInvalid},
		{"a different lead under the same signature",
			"lead-2." + parts[1] + "." + parts[2], apperrors.ErrTokenInvalid},
		{"an extended expiry under the same signature",
			parts[0] + ".99999999999." + parts[2], apperrors.ErrTokenInvalid},
		{"a forged signature", parts[0] + "." + parts[1] + ".AAAA", apperrors.ErrTokenInvalid},
		{"signed with another secret",
			signToken("some-other-secret", "lead-1", time.Now().Add(time.Hour)), apperrors.ErrTokenInvalid},
		{"expired", signToken(testSecret, "lead-1", time.Now().Add(-time.Minute)), apperrors.ErrTokenExpired},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseToken(testSecret, tc.token)

			require.Error(t, err)
			assert.ErrorIs(t, err, tc.want)
		})
	}
}
