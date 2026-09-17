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

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
)

const (
	verificationCodeTTL     = 10 * time.Minute
	maxVerificationAttempts = 5
	maxResendPerWindow      = 5
	resendWindowDuration    = 10 * time.Minute
)

// CodeSender delivers a 6-digit code by e-mail. Declared here as the
// narrowest thing VerificationService needs — the two letters it can send
// (email_verification, account_deletion_code) — so a test can capture what
// would have gone out without a live SMTP server, the same reason
// auth.Service takes MagicLinkSender instead of *email.Service directly.
type CodeSender interface {
	SendVerificationEmail(ctx context.Context, data email.VerificationEmailData) error
	SendAccountDeletionCode(ctx context.Context, data email.VerificationEmailData) error
}

// VerificationService handles email verification via 6-digit codes.
type VerificationService struct {
	db  *sql.DB
	log *logger.Logger
	// emailService is nil when the email capability is off — not an error,
	// the normal state in an environment without SMTP credentials.
	emailService CodeSender
}

// NewVerificationService creates a new verification service.
//
// emailService stays a concrete *email.Service in the signature — not
// CodeSender — so that a nil value passed here (the email capability being
// off) is stored as a genuinely nil interface. Accepting the interface type
// directly would let a nil *email.Service wrap into a non-nil CodeSender, and
// every "is email configured" check below would then be wrong.
func NewVerificationService(db *sql.DB, log *logger.Logger, emailService *email.Service) *VerificationService {
	vs := &VerificationService{db: db, log: log}
	if emailService != nil {
		vs.emailService = emailService
	}
	return vs
}

// WithCodeSender overrides the sender, for tests that want to capture what
// would have been e-mailed without a live SMTP server.
func (vs *VerificationService) WithCodeSender(sender CodeSender) *VerificationService {
	vs.emailService = sender
	return vs
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

// issueCode generates a code, rate-limits, stores it, and hands it to deliver
// for sending. Storage, rate limiting and the 6-digit format are the one
// mechanism shared by every caller; only the outbound letter differs, which
// is exactly what deliver captures.
func (vs *VerificationService) issueCode(ctx context.Context, userID int64, userEmail, ip, ua string,
	deliver func(email.VerificationEmailData) error) error {
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
		return fmt.Errorf("issueCode.rateLimit: %w", apperrors.ErrTooManyAttempts)
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

	if vs.emailService == nil {
		return fmt.Errorf("verification requires email: %w", apperrors.ErrEmailUnavailable)
	}

	if err := deliver(email.VerificationEmailData{
		UserEmail: userEmail,
		Code:      code,
		ExpiresAt: expiresAt,
	}); err != nil {
		vs.log.Errorw("Failed to send code email", "user_id", userID, "error", err)
		return fmt.Errorf("failed to send email")
	}

	vs.log.Infow("Code sent", "user_id", userID, "email", userEmail)
	return nil
}

// SendCode generates a new 6-digit code and sends it to the user's email, to
// confirm the address itself.
func (vs *VerificationService) SendCode(ctx context.Context, userID int64, userEmail, ip, ua string) error {
	return vs.issueCode(ctx, userID, userEmail, ip, ua, func(data email.VerificationEmailData) error {
		return vs.emailService.SendVerificationEmail(ctx, data)
	})
}

// SendDeletionCode generates a new 6-digit code and sends it to confirm the
// deletion of an account that has no password to check instead — see
// VerifyDeletionCode. Storage, rate limiting and the 6-digit format are
// identical to SendCode; only the outbound letter's subject differs, so the
// inbox says what is being confirmed.
func (vs *VerificationService) SendDeletionCode(ctx context.Context, userID int64, userEmail, ip, ua string) error {
	return vs.issueCode(ctx, userID, userEmail, ip, ua, func(data email.VerificationEmailData) error {
		return vs.emailService.SendAccountDeletionCode(ctx, data)
	})
}

// codeRecord is the most recent unused code for a user, as stored.
type codeRecord struct {
	id        int64
	hash      string
	expiresAt time.Time
	attempts  int
}

// latestUnusedCode fetches the code a submission is checked against.
func (vs *VerificationService) latestUnusedCode(ctx context.Context, userID int64) (codeRecord, error) {
	var rec codeRecord
	err := vs.db.QueryRowContext(ctx,
		`SELECT id, code_hash, expires_at, attempts
		 FROM email_verification_codes
		 WHERE user_id = $1 AND used_at IS NULL
		 ORDER BY created_at DESC
		 LIMIT 1`,
		userID,
	).Scan(&rec.id, &rec.hash, &rec.expiresAt, &rec.attempts)
	if err == sql.ErrNoRows {
		return rec, fmt.Errorf("no active code")
	}
	if err != nil {
		return rec, fmt.Errorf("failed to fetch code: %w", err)
	}
	return rec, nil
}

// matchCode checks a submitted code against rec, counting a wrong guess as an
// attempt. It never marks the code used — callers that accept the match do
// that themselves, since what "consumed" means differs by purpose (see
// VerifyCode vs VerifyDeletionCode).
func (vs *VerificationService) matchCode(ctx context.Context, rec codeRecord, code string) error {
	if rec.attempts >= maxVerificationAttempts {
		return fmt.Errorf("matchCode.maxAttempts: %w", apperrors.ErrTooManyAttempts)
	}

	if time.Now().After(rec.expiresAt) {
		return fmt.Errorf("matchCode.expired: %w", apperrors.ErrCodeExpired)
	}

	if hashCode(code) != rec.hash {
		_, _ = vs.db.ExecContext(ctx,
			`UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1`,
			rec.id,
		)
		return fmt.Errorf("invalid code")
	}

	return nil
}

// VerifyCode checks the submitted code against the latest unused code for the
// user, and marks the address confirmed.
func (vs *VerificationService) VerifyCode(ctx context.Context, userID int64, code string) error {
	rec, err := vs.latestUnusedCode(ctx, userID)
	if err != nil {
		return err
	}
	if err := vs.matchCode(ctx, rec, code); err != nil {
		return err
	}

	tx, err := vs.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx,
		`UPDATE email_verification_codes SET used_at = NOW() WHERE id = $1`, rec.id)
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

// VerifyDeletionCode checks a code sent for account deletion. Unlike
// VerifyCode it must not mark the address confirmed: a deletion code proves
// only that this request reached the mailbox, nothing about e-mail
// verification status.
func (vs *VerificationService) VerifyDeletionCode(ctx context.Context, userID int64, code string) error {
	rec, err := vs.latestUnusedCode(ctx, userID)
	if err != nil {
		return err
	}
	if err := vs.matchCode(ctx, rec, code); err != nil {
		return err
	}

	if _, err := vs.db.ExecContext(ctx,
		`UPDATE email_verification_codes SET used_at = NOW() WHERE id = $1`, rec.id); err != nil {
		return fmt.Errorf("failed to mark code used: %w", err)
	}

	vs.log.Infow("Deletion code verified", "user_id", userID)
	return nil
}
