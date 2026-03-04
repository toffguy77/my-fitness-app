package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"

	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
)

const (
	verificationCodeTTL     = 10 * time.Minute
	maxVerificationAttempts = 5
	maxResendPerWindow      = 5
	resendWindowDuration    = 10 * time.Minute
)

// VerificationService handles email verification via 6-digit codes.
type VerificationService struct {
	db           *sql.DB
	log          *logger.Logger
	emailService *email.Service
}

// NewVerificationService creates a new verification service.
func NewVerificationService(db *sql.DB, log *logger.Logger, emailService *email.Service) *VerificationService {
	return &VerificationService{
		db:           db,
		log:          log,
		emailService: emailService,
	}
}

// generateCode returns a cryptographically random 6-digit string ("000000"–"999999").
func generateCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", fmt.Errorf("failed to generate code: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// hashCode returns the hex-encoded SHA-256 hash of a code string.
func hashCode(code string) string {
	h := sha256.Sum256([]byte(code))
	return hex.EncodeToString(h[:])
}

// SendCode generates a new 6-digit code and sends it to the user's email.
func (vs *VerificationService) SendCode(ctx context.Context, userID int64, userEmail, ip, ua string) error {
	// Rate limit: count codes created in the last window
	var recentCount int
	err := vs.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM email_verification_codes
		 WHERE user_id = $1 AND created_at > $2`,
		userID, time.Now().Add(-resendWindowDuration),
	).Scan(&recentCount)
	if err != nil {
		return fmt.Errorf("failed to check rate limit: %w", err)
	}
	if recentCount >= maxResendPerWindow {
		return fmt.Errorf("too many requests")
	}

	// Generate code
	code, err := generateCode()
	if err != nil {
		return err
	}

	// Store hashed code
	expiresAt := time.Now().Add(verificationCodeTTL)
	_, err = vs.db.ExecContext(ctx,
		`INSERT INTO email_verification_codes (user_id, code_hash, expires_at, ip_address, user_agent)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, hashCode(code), expiresAt, ip, ua,
	)
	if err != nil {
		return fmt.Errorf("failed to store verification code: %w", err)
	}

	// Send email
	err = vs.emailService.SendVerificationEmail(ctx, email.VerificationEmailData{
		UserEmail: userEmail,
		Code:      code,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		vs.log.Errorw("Failed to send verification email", "user_id", userID, "error", err)
		return fmt.Errorf("failed to send email")
	}

	vs.log.Infow("Verification code sent", "user_id", userID, "email", userEmail)
	return nil
}

// VerifyCode checks the submitted code against the latest unused code for the user.
func (vs *VerificationService) VerifyCode(ctx context.Context, userID int64, code string) error {
	var codeID int64
	var storedHash string
	var expiresAt time.Time
	var attempts int

	err := vs.db.QueryRowContext(ctx,
		`SELECT id, code_hash, expires_at, attempts
		 FROM email_verification_codes
		 WHERE user_id = $1 AND used_at IS NULL
		 ORDER BY created_at DESC
		 LIMIT 1`,
		userID,
	).Scan(&codeID, &storedHash, &expiresAt, &attempts)
	if err == sql.ErrNoRows {
		return fmt.Errorf("no active code")
	}
	if err != nil {
		return fmt.Errorf("failed to fetch code: %w", err)
	}

	if attempts >= maxVerificationAttempts {
		return fmt.Errorf("too many attempts")
	}

	if time.Now().After(expiresAt) {
		return fmt.Errorf("code expired")
	}

	if hashCode(code) != storedHash {
		_, _ = vs.db.ExecContext(ctx,
			`UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1`,
			codeID,
		)
		return fmt.Errorf("invalid code")
	}

	tx, err := vs.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx,
		`UPDATE email_verification_codes SET used_at = NOW() WHERE id = $1`, codeID)
	if err != nil {
		return fmt.Errorf("failed to mark code used: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		`UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`, userID)
	if err != nil {
		return fmt.Errorf("failed to verify email: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	vs.log.Infow("Email verified", "user_id", userID)
	return nil
}
