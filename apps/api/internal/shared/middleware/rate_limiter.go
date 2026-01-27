package middleware

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/logger"
)

// RateLimiter handles rate limiting for password reset requests
type RateLimiter struct {
	db  *sql.DB
	log *logger.Logger
}

// RateLimitConfig defines rate limiting parameters
type RateLimitConfig struct {
	EmailLimit    int // 3 requests per email
	IPLimit       int // 10 requests per IP
	WindowMinutes int // 60 minutes
}

// DefaultRateLimitConfig returns the default rate limit configuration
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		EmailLimit:    3,
		IPLimit:       10,
		WindowMinutes: 60,
	}
}

// NewRateLimiter creates a new rate limiter instance
func NewRateLimiter(db *sql.DB, log *logger.Logger) *RateLimiter {
	return &RateLimiter{
		db:  db,
		log: log,
	}
}

// CheckEmailRateLimit checks if the email has exceeded the rate limit
// Returns error if rate limit is exceeded
func (rl *RateLimiter) CheckEmailRateLimit(ctx context.Context, email string) error {
	config := DefaultRateLimitConfig()

	query := `
		SELECT COUNT(*)
		FROM password_reset_attempts
		WHERE email = $1
		AND attempted_at > NOW() - INTERVAL '1 hour'
	`

	var count int
	err := rl.db.QueryRowContext(ctx, query, email).Scan(&count)
	if err != nil {
		rl.log.WithError(err).Error("Failed to check email rate limit",
			"email", email,
		)
		return fmt.Errorf("failed to check rate limit: %w", err)
	}

	if count >= config.EmailLimit {
		rl.log.LogSecurityEvent("email_rate_limit_exceeded", "high", map[string]interface{}{
			"email":        email,
			"attempt_count": count,
			"limit":        config.EmailLimit,
		})
		return fmt.Errorf("rate limit exceeded")
	}

	return nil
}

// CheckIPRateLimit checks if the IP address has exceeded the rate limit
// Returns error if rate limit is exceeded
func (rl *RateLimiter) CheckIPRateLimit(ctx context.Context, ipAddress string) error {
	config := DefaultRateLimitConfig()

	query := `
		SELECT COUNT(*)
		FROM password_reset_attempts
		WHERE ip_address = $1
		AND attempted_at > NOW() - INTERVAL '1 hour'
	`

	var count int
	err := rl.db.QueryRowContext(ctx, query, ipAddress).Scan(&count)
	if err != nil {
		rl.log.WithError(err).Error("Failed to check IP rate limit",
			"ip_address", ipAddress,
		)
		return fmt.Errorf("failed to check rate limit: %w", err)
	}

	if count >= config.IPLimit {
		rl.log.LogSecurityEvent("ip_rate_limit_exceeded", "high", map[string]interface{}{
			"ip_address":    ipAddress,
			"attempt_count": count,
			"limit":         config.IPLimit,
		})
		return fmt.Errorf("rate limit exceeded")
	}

	return nil
}

// RecordResetAttempt records a password reset attempt for rate limiting
func (rl *RateLimiter) RecordResetAttempt(ctx context.Context, email string, ipAddress string) error {
	query := `
		INSERT INTO password_reset_attempts (email, ip_address, attempted_at)
		VALUES ($1, $2, NOW())
	`

	_, err := rl.db.ExecContext(ctx, query, email, ipAddress)
	if err != nil {
		rl.log.WithError(err).Error("Failed to record reset attempt",
			"email", email,
			"ip_address", ipAddress,
		)
		return fmt.Errorf("failed to record attempt: %w", err)
	}

	rl.log.Debug("Recorded password reset attempt",
		"email", email,
		"ip_address", ipAddress,
	)

	return nil
}

// CleanupOldAttempts removes password reset attempts older than 24 hours
// Returns the number of deleted records
func (rl *RateLimiter) CleanupOldAttempts(ctx context.Context) (int, error) {
	query := `
		DELETE FROM password_reset_attempts
		WHERE attempted_at < NOW() - INTERVAL '24 hours'
	`

	result, err := rl.db.ExecContext(ctx, query)
	if err != nil {
		rl.log.WithError(err).Error("Failed to cleanup old reset attempts")
		return 0, fmt.Errorf("failed to cleanup: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}

	if rowsAffected > 0 {
		rl.log.Info("Cleaned up old password reset attempts",
			"deleted_count", rowsAffected,
		)
	}

	return int(rowsAffected), nil
}

// GetAttemptCount returns the number of attempts for an email or IP in the last hour
func (rl *RateLimiter) GetAttemptCount(ctx context.Context, email string, ipAddress string) (emailCount int, ipCount int, err error) {
	// Get email count
	emailQuery := `
		SELECT COUNT(*)
		FROM password_reset_attempts
		WHERE email = $1
		AND attempted_at > NOW() - INTERVAL '1 hour'
	`
	err = rl.db.QueryRowContext(ctx, emailQuery, email).Scan(&emailCount)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get email count: %w", err)
	}

	// Get IP count
	ipQuery := `
		SELECT COUNT(*)
		FROM password_reset_attempts
		WHERE ip_address = $1
		AND attempted_at > NOW() - INTERVAL '1 hour'
	`
	err = rl.db.QueryRowContext(ctx, ipQuery, ipAddress).Scan(&ipCount)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get IP count: %w", err)
	}

	return emailCount, ipCount, nil
}

// GetRecentAttempts returns recent attempts for monitoring purposes
func (rl *RateLimiter) GetRecentAttempts(ctx context.Context, limit int) ([]ResetAttempt, error) {
	query := `
		SELECT id, email, ip_address, attempted_at
		FROM password_reset_attempts
		ORDER BY attempted_at DESC
		LIMIT $1
	`

	rows, err := rl.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get recent attempts: %w", err)
	}
	defer rows.Close()

	var attempts []ResetAttempt
	for rows.Next() {
		var attempt ResetAttempt
		err := rows.Scan(&attempt.ID, &attempt.Email, &attempt.IPAddress, &attempt.AttemptedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan attempt: %w", err)
		}
		attempts = append(attempts, attempt)
	}

	return attempts, rows.Err()
}

// ResetAttempt represents a password reset attempt record
type ResetAttempt struct {
	ID          int64
	Email       string
	IPAddress   string
	AttemptedAt time.Time
}
