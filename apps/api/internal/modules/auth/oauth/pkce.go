package oauth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

// PKCE parameters for one authorization attempt.
//
// PKCE is used even though this client is confidential: it costs nothing and it
// removes the class of attack where an intercepted authorization code is
// redeemed by somebody else.
type PKCE struct {
	Verifier  string
	Challenge string
	State     string
}

// NewPKCE generates a verifier, its challenge and an unguessable state value.
func NewPKCE() (*PKCE, error) {
	verifier, err := randomURLSafe(64)
	if err != nil {
		return nil, fmt.Errorf("generate verifier: %w", err)
	}
	state, err := randomURLSafe(32)
	if err != nil {
		return nil, fmt.Errorf("generate state: %w", err)
	}

	sum := sha256.Sum256([]byte(verifier))
	return &PKCE{
		Verifier:  verifier,
		Challenge: base64.RawURLEncoding.EncodeToString(sum[:]),
		State:     state,
	}, nil
}

// ChallengeFor recomputes the challenge for a verifier, so the callback can
// confirm the two belong together.
func ChallengeFor(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func randomURLSafe(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
