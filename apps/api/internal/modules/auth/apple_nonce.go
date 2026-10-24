package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
)

// Одноразовый nonce входа через Apple (apple-sign-in).
//
// Приложение берёт nonce у сервера (POST /auth/native/apple/nonce), кладёт
// его SHA-256 в ASAuthorizationAppleIDRequest.nonce и возвращает исходное
// значение вместе с identity token. Сервер хранит только хэш — то же, что
// Apple копирует в токен, — и гасит его первым же входом. Так identity
// token, перехваченный или сохранённый, не предъявить второй раз, даже
// когда вход привязанного аккаунта обходится без обмена authorization_code
// (Apple недоступна): nonce придумать нельзя, а выданный уже погашен.

// AppleNonceTTL bounds how long an issued nonce can be used. The app asks for
// it right before showing the Apple sheet; ten minutes covers a person who
// stops to think, and no more.
const AppleNonceTTL = 10 * time.Minute

func appleNonceHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// IssueAppleNonce returns a fresh random nonce and stores its hash.
func (s *Service) IssueAppleNonce(ctx context.Context) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate apple nonce: %w", err)
	}
	raw := base64.RawURLEncoding.EncodeToString(buf)
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO apple_sign_in_nonces (nonce_hash, expires_at)
		VALUES ($1, NOW() + $2::interval)`,
		appleNonceHash(raw), fmt.Sprintf("%d seconds", int(AppleNonceTTL.Seconds()))); err != nil {
		return "", fmt.Errorf("store apple nonce: %w", err)
	}
	return raw, nil
}

// ConsumeAppleNonce spends a nonce the server issued. One UPDATE with every
// condition in its WHERE, so two requests racing with the same token cannot
// both pass. A nonce that was never issued, is spent or has expired wraps
// apperrors.ErrTokenInvalid.
func (s *Service) ConsumeAppleNonce(ctx context.Context, raw string) error {
	var hash string
	err := s.db.QueryRowContext(ctx, `
		UPDATE apple_sign_in_nonces SET used_at = NOW()
		 WHERE nonce_hash = $1 AND used_at IS NULL AND expires_at > NOW()
		RETURNING nonce_hash`, appleNonceHash(raw)).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("apple nonce not issued, spent or expired: %w", apperrors.ErrTokenInvalid)
	}
	if err != nil {
		return fmt.Errorf("consume apple nonce: %w", err)
	}
	return nil
}

// PurgeExpiredAppleNonces drops nonces that can no longer be spent. A spent
// one is never read again either; the hour of margin keeps the trail of a
// sign-in for whoever looks into it the same day.
func (s *Service) PurgeExpiredAppleNonces(ctx context.Context) (int, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM apple_sign_in_nonces WHERE expires_at < NOW() - INTERVAL '1 hour'`)
	if err != nil {
		return 0, fmt.Errorf("purge apple nonces: %w", err)
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}
