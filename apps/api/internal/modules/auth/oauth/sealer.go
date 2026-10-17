package oauth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

// Sealer encrypts a provider's own refresh token for storage.
//
// AES-256-GCM with a random nonce per value; the stored form is
// "v1." + base64(nonce || ciphertext). A copy of the database alone is then
// not enough to act as us towards the provider. The prefix names the scheme,
// so a later key rotation can tell old values from new ones.
type Sealer struct {
	aead cipher.AEAD
}

const sealedPrefix = "v1."

// NewSealer takes the key as 32 bytes in standard base64
// (APPLE_TOKEN_ENCRYPTION_KEY).
func NewSealer(keyBase64 string) (*Sealer, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(keyBase64))
	if err != nil {
		return nil, fmt.Errorf("token encryption key is not base64: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("token encryption key must be 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Sealer{aead: aead}, nil
}

// Seal encrypts plain.
func (s *Sealer) Seal(plain string) (string, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := s.aead.Seal(nonce, nonce, []byte(plain), nil)
	return sealedPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// Open decrypts a value produced by Seal.
func (s *Sealer) Open(sealed string) (string, error) {
	if !strings.HasPrefix(sealed, sealedPrefix) {
		return "", errors.New("sealed token has an unknown format")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(sealed, sealedPrefix))
	if err != nil {
		return "", fmt.Errorf("sealed token is not base64: %w", err)
	}
	size := s.aead.NonceSize()
	if len(raw) < size {
		return "", errors.New("sealed token is too short")
	}
	plain, err := s.aead.Open(nil, raw[:size], raw[size:], nil)
	if err != nil {
		return "", fmt.Errorf("open sealed token: %w", err)
	}
	return string(plain), nil
}
