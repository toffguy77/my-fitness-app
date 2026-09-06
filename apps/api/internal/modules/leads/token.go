package leads

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// LeadCookieName carries the lead token through a sign-up that leaves the site.
//
// Declared here rather than in the auth module because this package issues the
// cookie; auth only reads and clears it. When the two names were written out
// separately, one of them was a name nobody set.
const LeadCookieName = "lead_token"

// ResumeTTL bounds how long a return link stays usable.
const ResumeTTL = 14 * 24 * time.Hour

// signToken produces "<id>.<expiry>.<signature>".
//
// The link a reminder carries has to open exactly one lead and nothing else. A
// bare identifier in a URL would let anyone walk the table and read strangers'
// body parameters, so what travels is signed and expires.
func signToken(secret, leadID string, expiry time.Time) string {
	payload := leadID + "." + strconv.FormatInt(expiry.Unix(), 10)
	return payload + "." + sign(secret, payload)
}

// parseToken returns the lead id a valid, unexpired token names.
func parseToken(secret, token string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", fmt.Errorf("malformed resume token: %w", apperrors.ErrTokenInvalid)
	}

	payload := parts[0] + "." + parts[1]
	// Constant time: a comparison that returns early tells an attacker how much
	// of a forged signature was right.
	if !hmac.Equal([]byte(sign(secret, payload)), []byte(parts[2])) {
		return "", fmt.Errorf("resume token signature mismatch: %w", apperrors.ErrTokenInvalid)
	}

	expiry, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return "", fmt.Errorf("malformed resume token expiry: %w", apperrors.ErrTokenInvalid)
	}
	if time.Now().After(time.Unix(expiry, 0)) {
		return "", fmt.Errorf("resume token expired: %w", apperrors.ErrTokenExpired)
	}

	return parts[0], nil
}

func sign(secret, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
