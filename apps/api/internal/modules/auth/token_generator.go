package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// TokenGenerator generates and validates cryptographically secure tokens
// for password reset functionality. Tokens are generated with 256 bits of
// entropy and stored as SHA-256 hashes for security.
type TokenGenerator struct {
	tokenLength int // Length in bytes (32 bytes = 256 bits)
}

// NewTokenGenerator creates a new TokenGenerator with default settings.
// The default token length is 32 bytes (256 bits) for cryptographic security.
func NewTokenGenerator() *TokenGenerator {
	return &TokenGenerator{
		tokenLength: 32, // 32 bytes = 256 bits of entropy
	}
}

// GenerateToken generates a cryptographically secure random token.
// It returns both the plain token (to be sent to the user) and the hashed
// token (to be stored in the database).
//
// The plain token is a hex-encoded string of random bytes, providing
// 256 bits of entropy for security. The hashed token is a SHA-256 hash
// of the plain token, ensuring tokens are never stored in plain text.
//
// Returns:
//   - plainToken: The token to send to the user (hex-encoded)
//   - hashedToken: The SHA-256 hash to store in the database (hex-encoded)
//   - error: Any error that occurred during generation
//
// Example:
//   tg := NewTokenGenerator()
//   plain, hashed, err := tg.GenerateToken()
//   if err != nil {
//       // Handle error
//   }
//   // Send 'plain' to user, store 'hashed' in database
func (tg *TokenGenerator) GenerateToken() (plainToken string, hashedToken string, err error) {
	// Generate random bytes using crypto/rand for cryptographic security
	randomBytes := make([]byte, tg.tokenLength)
	_, err = rand.Read(randomBytes)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate random token: %w", err)
	}

	// Encode to hex string for URL-safe transmission
	plainToken = hex.EncodeToString(randomBytes)

	// Hash the token for secure storage
	hashedToken = tg.HashToken(plainToken)

	return plainToken, hashedToken, nil
}

// HashToken creates a SHA-256 hash of the provided token.
// This is used to securely store tokens in the database without
// exposing the plain token value.
//
// Parameters:
//   - plainToken: The plain token string to hash
//
// Returns:
//   - The hex-encoded SHA-256 hash of the token
//
// Example:
//   tg := NewTokenGenerator()
//   hashed := tg.HashToken("abc123...")
func (tg *TokenGenerator) HashToken(plainToken string) string {
	hash := sha256.Sum256([]byte(plainToken))
	return hex.EncodeToString(hash[:])
}

// VerifyToken compares a plain token against a hashed token.
// This is used during password reset to verify that the token
// provided by the user matches the hashed token stored in the database.
//
// The function uses constant-time comparison to prevent timing attacks.
//
// Parameters:
//   - plainToken: The token provided by the user
//   - hashedToken: The hashed token stored in the database
//
// Returns:
//   - true if the tokens match, false otherwise
//
// Example:
//   tg := NewTokenGenerator()
//   if tg.VerifyToken(userToken, storedHash) {
//       // Token is valid
//   }
func (tg *TokenGenerator) VerifyToken(plainToken string, hashedToken string) bool {
	// Hash the plain token and compare with stored hash
	computedHash := tg.HashToken(plainToken)

	// Use constant-time comparison to prevent timing attacks
	// This ensures the comparison takes the same time regardless of
	// where the strings differ
	if len(computedHash) != len(hashedToken) {
		return false
	}

	var result byte
	for i := 0; i < len(computedHash); i++ {
		result |= computedHash[i] ^ hashedToken[i]
	}

	return result == 0
}
