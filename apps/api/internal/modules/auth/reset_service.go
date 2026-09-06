package auth

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"golang.org/x/crypto/bcrypt"
)

// ResetService handles password reset operations
type ResetService struct {
	db           *sql.DB
	cfg          *config.Config
	log          *logger.Logger
	emailService *email.Service
	rateLimiter  *middleware.RateLimiter
	tokenGen     *TokenGenerator
	passwordVal  *PasswordValidator
	sessions     SessionCache
}

// WithSessionCache supplies the cache to invalidate when a reset ends every
// session. Separate from the constructor for the same reason as on Service:
// the cache is built after the services are.
func (rs *ResetService) WithSessionCache(cache SessionCache) *ResetService {
	rs.sessions = cache
	return rs
}

// ResetTokenData represents a reset token record
type ResetTokenData struct {
	ID        int64
	UserID    int64
	TokenHash string
	CreatedAt time.Time
	ExpiresAt time.Time
	UsedAt    *time.Time
	IPAddress string
	UserAgent string
}

// NewResetService creates a new password reset service
func NewResetService(
	db *sql.DB,
	cfg *config.Config,
	log *logger.Logger,
	emailService *email.Service,
	rateLimiter *middleware.RateLimiter,
) *ResetService {
	return &ResetService{
		db:           db,
		cfg:          cfg,
		log:          log,
		emailService: emailService,
		rateLimiter:  rateLimiter,
		tokenGen:     NewTokenGenerator(),
		passwordVal:  NewPasswordValidator(),
	}
}

// RequestPasswordReset initiates a password reset request
// Returns generic response regardless of email existence (security)
func (rs *ResetService) RequestPasswordReset(ctx context.Context, userEmail string, ipAddress string, userAgent string) error {
	// Check rate limits first
	if err := rs.rateLimiter.CheckEmailRateLimit(ctx, userEmail); err != nil {
		rs.log.LogSecurityEvent("password_reset_rate_limit", "high", map[string]any{
			"email":      userEmail,
			"ip_address": ipAddress,
			"reason":     "email_rate_limit",
		})
		return fmt.Errorf("email rate limit: %w", apperrors.ErrTooManyAttempts)
	}

	if err := rs.rateLimiter.CheckIPRateLimit(ctx, ipAddress); err != nil {
		rs.log.LogSecurityEvent("password_reset_rate_limit", "high", map[string]any{
			"email":      userEmail,
			"ip_address": ipAddress,
			"reason":     "ip_rate_limit",
		})
		return fmt.Errorf("ip rate limit: %w", apperrors.ErrTooManyAttempts)
	}

	// Record the attempt
	if err := rs.rateLimiter.RecordResetAttempt(ctx, userEmail, ipAddress); err != nil {
		rs.log.WithError(err).Error("Failed to record reset attempt")
		// Continue anyway - don't fail the request
	}

	// Check if user exists
	var userID int64
	var existingEmail string
	query := `SELECT id, email FROM users WHERE email = $1`
	err := rs.db.QueryRowContext(ctx, query, userEmail).Scan(&userID, &existingEmail)

	if err == sql.ErrNoRows {
		// User doesn't exist - return success anyway (prevent email enumeration)
		rs.log.Info("Password reset requested for non-existent email",
			"email", userEmail,
			"ip_address", ipAddress,
		)
		// Sleep to make timing consistent
		time.Sleep(100 * time.Millisecond)
		return nil
	}

	if err != nil {
		rs.log.WithError(err).Error("Failed to query user",
			"email", userEmail,
		)
		return fmt.Errorf("failed to process request")
	}

	// Invalidate all previous tokens for this user
	if err := rs.invalidateUserTokens(ctx, userID); err != nil {
		rs.log.WithError(err).Error("Failed to invalidate previous tokens",
			"user_id", userID,
		)
		// Continue anyway
	}

	// Generate new token
	plainToken, hashedToken, err := rs.tokenGen.GenerateToken()
	if err != nil {
		rs.log.WithError(err).Error("Failed to generate reset token",
			"user_id", userID,
		)
		return fmt.Errorf("failed to generate token")
	}

	// Store token in database
	expiresAt := time.Now().Add(1 * time.Hour)
	insertQuery := `
		INSERT INTO reset_tokens (user_id, token_hash, created_at, expires_at, ip_address, user_agent)
		VALUES ($1, $2, NOW(), $3, $4, $5)
		RETURNING id
	`

	var tokenID int64
	err = rs.db.QueryRowContext(ctx, insertQuery, userID, hashedToken, expiresAt, ipAddress, userAgent).Scan(&tokenID)
	if err != nil {
		rs.log.WithError(err).Error("Failed to store reset token",
			"user_id", userID,
		)
		return fmt.Errorf("failed to store token")
	}

	// Build reset URL
	resetURL := fmt.Sprintf("%s?token=%s", rs.cfg.ResetPasswordURL, plainToken)

	// Send email
	emailData := email.ResetEmailData{
		UserEmail:      existingEmail,
		ResetURL:       resetURL,
		ExpirationTime: expiresAt,
		SupportEmail:   "support@burcev.team",
	}

	if rs.emailService == nil {
		// Email is an optional capability; without it a reset link cannot be
		// delivered, so the request fails rather than silently doing nothing.
		return fmt.Errorf("password reset requires email: %w", apperrors.ErrEmailUnavailable)
	}

	err = rs.emailService.SendPasswordResetEmail(ctx, emailData)
	if err != nil {
		rs.log.WithError(err).Error("Failed to send reset email",
			"user_id", userID,
			"email", existingEmail,
		)

		// Invalidate the token since email failed
		deleteQuery := `DELETE FROM reset_tokens WHERE id = $1`
		if _, delErr := rs.db.ExecContext(ctx, deleteQuery, tokenID); delErr != nil {
			rs.log.WithError(delErr).Error("Failed to delete token after email failure",
				"token_id", tokenID,
			)
		}

		return fmt.Errorf("failed to send email")
	}

	rs.log.Info("Password reset email sent successfully",
		"user_id", userID,
		"email", existingEmail,
		"ip_address", ipAddress,
	)

	return nil
}

// ValidateResetToken validates a reset token
func (rs *ResetService) ValidateResetToken(ctx context.Context, plainToken string) (*ResetTokenData, error) {
	// Hash the token
	hashedToken := rs.tokenGen.HashToken(plainToken)

	// Query token from database
	query := `
		SELECT id, user_id, token_hash, created_at, expires_at, used_at, ip_address, user_agent
		FROM reset_tokens
		WHERE token_hash = $1
	`

	var tokenData ResetTokenData
	var usedAt sql.NullTime

	err := rs.db.QueryRowContext(ctx, query, hashedToken).Scan(
		&tokenData.ID,
		&tokenData.UserID,
		&tokenData.TokenHash,
		&tokenData.CreatedAt,
		&tokenData.ExpiresAt,
		&usedAt,
		&tokenData.IPAddress,
		&tokenData.UserAgent,
	)

	if err == sql.ErrNoRows {
		rs.log.Warn("Invalid reset token attempted",
			"token_hash", hashedToken[:10]+"...",
		)
		return nil, fmt.Errorf("lookup: %w", apperrors.ErrTokenInvalid)
	}

	if err != nil {
		rs.log.WithError(err).Error("Failed to query reset token")
		return nil, fmt.Errorf("failed to validate token")
	}

	if usedAt.Valid {
		tokenData.UsedAt = &usedAt.Time
	}

	// Check if token has been used
	if tokenData.UsedAt != nil {
		rs.log.Warn("Used reset token attempted",
			"token_id", tokenData.ID,
			"user_id", tokenData.UserID,
		)
		return nil, fmt.Errorf("already used: %w", apperrors.ErrTokenInvalid)
	}

	// Check if token has expired
	if time.Now().After(tokenData.ExpiresAt) {
		rs.log.Warn("Expired reset token attempted",
			"token_id", tokenData.ID,
			"user_id", tokenData.UserID,
			"expired_at", tokenData.ExpiresAt,
		)

		// Clean up expired token
		deleteQuery := `DELETE FROM reset_tokens WHERE id = $1`
		if _, err := rs.db.ExecContext(ctx, deleteQuery, tokenData.ID); err != nil {
			rs.log.WithError(err).Error("Failed to delete expired token",
				"token_id", tokenData.ID,
			)
		}

		return nil, fmt.Errorf("expired: %w", apperrors.ErrTokenExpired)
	}

	return &tokenData, nil
}

// ResetPassword resets a user's password using a valid token
func (rs *ResetService) ResetPassword(ctx context.Context, plainToken string, newPassword string, ipAddress string) error {
	// Validate token
	tokenData, err := rs.ValidateResetToken(ctx, plainToken)
	if err != nil {
		return err
	}

	// Validate password
	validationResult := rs.passwordVal.Validate(newPassword)
	if !validationResult.Valid {
		rs.log.Warn("Invalid password provided for reset",
			"user_id", tokenData.UserID,
			"errors", validationResult.Errors,
		)
		// Wrapped, because the handler distinguishes a policy failure (which the
		// user can fix) from a server failure (which they cannot) with
		// errors.Is. Unwrapped, every weak password came back as a 500 saying
		// "try again" — advice that could not work.
		return fmt.Errorf("пароль не соответствует требованиям: %v: %w",
			validationResult.Errors, apperrors.ErrPasswordPolicy)
	}

	// Hash password with bcrypt
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		rs.log.WithError(err).Error("Failed to hash password",
			"user_id", tokenData.UserID,
		)
		return fmt.Errorf("failed to hash password")
	}

	// Start transaction
	tx, err := rs.db.BeginTx(ctx, nil)
	if err != nil {
		rs.log.WithError(err).Error("Failed to start transaction")
		return fmt.Errorf("failed to start transaction")
	}
	defer tx.Rollback()

	// Update password
	updateQuery := `
		UPDATE users
		SET password = $1, password_changed_at = NOW()
		WHERE id = $2
	`

	result, err := tx.ExecContext(ctx, updateQuery, string(hashedPassword), tokenData.UserID)
	if err != nil {
		rs.log.WithError(err).Error("Failed to update password",
			"user_id", tokenData.UserID,
		)
		return fmt.Errorf("failed to update password")
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil || rowsAffected == 0 {
		rs.log.Error("No rows affected when updating password",
			"user_id", tokenData.UserID,
		)
		return fmt.Errorf("failed to update password")
	}

	// Mark token as used
	markUsedQuery := `
		UPDATE reset_tokens
		SET used_at = NOW()
		WHERE id = $1
	`

	_, err = tx.ExecContext(ctx, markUsedQuery, tokenData.ID)
	if err != nil {
		rs.log.WithError(err).Error("Failed to mark token as used",
			"token_id", tokenData.ID,
		)
		return fmt.Errorf("failed to mark token as used")
	}

	// End every session, in the same transaction that changes the password.
	//
	// This used to be a log line saying sessions "should be invalidated",
	// written when there was no mechanism to invalidate them. There is one now,
	// and reset is the flow that needs it most: a person resets their password
	// precisely when someone else has their account, and until this ran, that
	// someone else kept a working access token and a working refresh token.
	//
	// Revoking refresh tokens stops new access tokens being minted; the version
	// bump stops the ones already minted from being accepted. Neither alone is
	// a revocation.
	if _, err := tx.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
		tokenData.UserID); err != nil {
		rs.log.WithError(err).Error("Failed to revoke refresh tokens", "user_id", tokenData.UserID)
		return fmt.Errorf("failed to revoke sessions")
	}
	// Loud rather than silent: a reset that leaves access tokens valid is worse
	// than a reset that fails, because the person believes they are safe.
	if rs.sessions == nil {
		return fmt.Errorf("password reset needs a token-version cache: %w", apperrors.ErrValidation)
	}
	if err := rs.sessions.BumpVersion(ctx, tx, tokenData.UserID); err != nil {
		rs.log.WithError(err).Error("Failed to bump token version", "user_id", tokenData.UserID)
		return fmt.Errorf("failed to revoke sessions")
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		rs.log.WithError(err).Error("Failed to commit transaction",
			"user_id", tokenData.UserID,
		)
		return fmt.Errorf("failed to commit transaction")
	}

	// Get user email for confirmation
	var userEmail string
	emailQuery := `SELECT email FROM users WHERE id = $1`
	err = rs.db.QueryRowContext(ctx, emailQuery, tokenData.UserID).Scan(&userEmail)
	if err != nil {
		rs.log.WithError(err).Error("Failed to get user email for confirmation",
			"user_id", tokenData.UserID,
		)
		// Don't fail the request - password was already changed
	} else {
		// Send confirmation email
		emailData := email.PasswordChangedEmailData{
			UserEmail:    userEmail,
			ChangedAt:    time.Now(),
			IPAddress:    ipAddress,
			SupportEmail: "support@burcev.team",
		}

		if rs.emailService == nil {
			// Notifying the user is best effort; the password has already
			// changed and that must not be undone.
			rs.log.Warn("Password changed but no email service is configured", "user_id", tokenData.UserID)
		} else if err := rs.emailService.SendPasswordChangedEmail(ctx, emailData); err != nil {
			rs.log.WithError(err).Error("Failed to send password changed email",
				"user_id", tokenData.UserID,
			)
			// Don't fail the request - password was already changed
		}
	}

	rs.log.LogSecurityEvent("password_reset_completed", "info", map[string]any{
		"user_id":    tokenData.UserID,
		"ip_address": ipAddress,
	})

	return nil
}

// invalidateUserTokens invalidates all previous reset tokens for a user
func (rs *ResetService) invalidateUserTokens(ctx context.Context, userID int64) error {
	query := `
		DELETE FROM reset_tokens
		WHERE user_id = $1
		AND used_at IS NULL
	`

	result, err := rs.db.ExecContext(ctx, query, userID)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		rs.log.Info("Invalidated previous reset tokens",
			"user_id", userID,
			"count", rowsAffected,
		)
	}

	return nil
}

// CleanupExpiredTokens removes expired reset tokens
func (rs *ResetService) CleanupExpiredTokens(ctx context.Context) (int, error) {
	query := `
		DELETE FROM reset_tokens
		WHERE expires_at < NOW()
		AND used_at IS NULL
	`

	result, err := rs.db.ExecContext(ctx, query)
	if err != nil {
		rs.log.WithError(err).Error("Failed to cleanup expired tokens")
		return 0, err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		rs.log.Info("Cleaned up expired reset tokens",
			"count", rowsAffected,
		)
	}

	return int(rowsAffected), nil
}
