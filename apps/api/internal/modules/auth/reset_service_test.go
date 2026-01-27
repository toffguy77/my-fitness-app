package auth

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupResetServiceTest(t *testing.T) (*ResetService, sqlmock.Sqlmock, func()) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	log := logger.New()
	cfg := &config.Config{
		ResetPasswordURL: "http://localhost:3000/reset-password",
	}

	emailCfg := email.Config{
		SMTPHost:     "smtp.test.com",
		SMTPPort:     465,
		SMTPUsername: "test@test.com",
		SMTPPassword: "password",
		FromAddress:  "noreply@test.com",
		FromName:     "Test",
	}

	emailService, err := email.NewService(emailCfg, log)
	require.NoError(t, err)

	rateLimiter := middleware.NewRateLimiter(db, log)

	service := NewResetService(db, cfg, log, emailService, rateLimiter)

	cleanup := func() {
		db.Close()
	}

	return service, mock, cleanup
}

func TestNewResetService(t *testing.T) {
	service, _, cleanup := setupResetServiceTest(t)
	defer cleanup()

	assert.NotNil(t, service)
	assert.NotNil(t, service.tokenGen)
	assert.NotNil(t, service.passwordVal)
}

func TestValidateResetToken(t *testing.T) {
	tests := []struct {
		name          string
		setupMock     func(sqlmock.Sqlmock, string)
		expectError   bool
		errorContains string
	}{
		{
			name: "Valid unused token",
			setupMock: func(mock sqlmock.Sqlmock, hashedToken string) {
				rows := sqlmock.NewRows([]string{
					"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
				}).AddRow(
					1, 123, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, "192.168.1.1", "test-agent",
				)
				mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
					WithArgs(hashedToken).
					WillReturnRows(rows)
			},
			expectError: false,
		},
		{
			name: "Token not found",
			setupMock: func(mock sqlmock.Sqlmock, hashedToken string) {
				mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
					WithArgs(hashedToken).
					WillReturnError(sql.ErrNoRows)
			},
			expectError:   true,
			errorContains: "invalid token",
		},
		{
			name: "Token already used",
			setupMock: func(mock sqlmock.Sqlmock, hashedToken string) {
				usedAt := time.Now().Add(-10 * time.Minute)
				rows := sqlmock.NewRows([]string{
					"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
				}).AddRow(
					1, 123, hashedToken, time.Now().Add(-1*time.Hour), time.Now().Add(1*time.Hour), usedAt, "192.168.1.1", "test-agent",
				)
				mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
					WithArgs(hashedToken).
					WillReturnRows(rows)
			},
			expectError:   true,
			errorContains: "invalid token",
		},
		{
			name: "Token expired",
			setupMock: func(mock sqlmock.Sqlmock, hashedToken string) {
				rows := sqlmock.NewRows([]string{
					"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
				}).AddRow(
					1, 123, hashedToken, time.Now().Add(-2*time.Hour), time.Now().Add(-1*time.Hour), nil, "192.168.1.1", "test-agent",
				)
				mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
					WithArgs(hashedToken).
					WillReturnRows(rows)
				mock.ExpectExec("DELETE FROM reset_tokens").
					WithArgs(1).
					WillReturnResult(sqlmock.NewResult(0, 1))
			},
			expectError:   true,
			errorContains: "token expired",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service, mock, cleanup := setupResetServiceTest(t)
			defer cleanup()

			plainToken := "test-token-123"
			hashedToken := service.tokenGen.HashToken(plainToken)

			tt.setupMock(mock, hashedToken)

			tokenData, err := service.ValidateResetToken(context.Background(), plainToken)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
				assert.Nil(t, tokenData)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, tokenData)
				assert.Equal(t, int64(123), tokenData.UserID)
			}

			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestInvalidateUserTokens(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	userID := int64(123)

	mock.ExpectExec("DELETE FROM reset_tokens").
		WithArgs(userID).
		WillReturnResult(sqlmock.NewResult(0, 2))

	err := service.invalidateUserTokens(context.Background(), userID)

	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestCleanupExpiredTokens(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	mock.ExpectExec("DELETE FROM reset_tokens").
		WillReturnResult(sqlmock.NewResult(0, 5))

	count, err := service.CleanupExpiredTokens(context.Background())

	assert.NoError(t, err)
	assert.Equal(t, 5, count)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRequestPasswordReset_NonExistentUser(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	email := "nonexistent@example.com"
	ipAddress := "192.168.1.1"

	// Rate limit checks
	mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
		WithArgs(email).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
		WithArgs(ipAddress).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	// Record attempt
	mock.ExpectExec("INSERT INTO password_reset_attempts").
		WithArgs(email, ipAddress).
		WillReturnResult(sqlmock.NewResult(1, 1))

	// User lookup - not found
	mock.ExpectQuery("SELECT id, email FROM users").
		WithArgs(email).
		WillReturnError(sql.ErrNoRows)

	err := service.RequestPasswordReset(context.Background(), email, ipAddress, "test-agent")

	// Should succeed (no error) to prevent email enumeration
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRequestPasswordReset_RateLimitExceeded(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	email := "user@example.com"
	ipAddress := "192.168.1.1"

	// Email rate limit exceeded
	mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
		WithArgs(email).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))

	err := service.RequestPasswordReset(context.Background(), email, ipAddress, "test-agent")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "too many requests")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPasswordValidation(t *testing.T) {
	service, _, cleanup := setupResetServiceTest(t)
	defer cleanup()

	tests := []struct {
		name     string
		password string
		valid    bool
	}{
		{
			name:     "Valid password",
			password: "Test123!@#",
			valid:    true,
		},
		{
			name:     "Too short",
			password: "Test1!",
			valid:    false,
		},
		{
			name:     "No uppercase",
			password: "test123!@#",
			valid:    false,
		},
		{
			name:     "No lowercase",
			password: "TEST123!@#",
			valid:    false,
		},
		{
			name:     "No number",
			password: "TestTest!@#",
			valid:    false,
		},
		{
			name:     "No special char",
			password: "Test1234567",
			valid:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.passwordVal.Validate(tt.password)
			assert.Equal(t, tt.valid, result.Valid)
		})
	}
}

func TestRequestPasswordReset_Success(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	userEmail := "user@example.com"
	ipAddress := "192.168.1.1"
	userAgent := "Mozilla/5.0"

	// Rate limit checks
	mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
		WithArgs(userEmail).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
		WithArgs(ipAddress).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	// Record attempt
	mock.ExpectExec("INSERT INTO password_reset_attempts").
		WithArgs(userEmail, ipAddress).
		WillReturnResult(sqlmock.NewResult(1, 1))

	// User lookup - found
	mock.ExpectQuery("SELECT id, email FROM users").
		WithArgs(userEmail).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email"}).AddRow(123, userEmail))

	// Invalidate old tokens
	mock.ExpectExec("DELETE FROM reset_tokens").
		WithArgs(int64(123)).
		WillReturnResult(sqlmock.NewResult(0, 0))

	// Insert new token
	mock.ExpectQuery("INSERT INTO reset_tokens").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	err := service.RequestPasswordReset(context.Background(), userEmail, ipAddress, userAgent)

	// Should fail because email service is not configured for real sending
	// But we can verify the database operations were attempted
	assert.Error(t, err) // Email sending will fail in test
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_Success(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Validate token
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	// Begin transaction
	mock.ExpectBegin()

	// Update password
	mock.ExpectExec("UPDATE users").
		WithArgs(sqlmock.AnyArg(), userID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Mark token as used
	mock.ExpectExec("UPDATE reset_tokens").
		WithArgs(1).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Commit transaction
	mock.ExpectCommit()

	// Get user email for confirmation
	mock.ExpectQuery("SELECT email FROM users").
		WithArgs(userID).
		WillReturnRows(sqlmock.NewRows([]string{"email"}).AddRow("user@example.com"))

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	// Should succeed even if email fails (password was already changed)
	// Email failure is logged but doesn't fail the operation
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_TransactionFailure(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Validate token
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	// Begin transaction fails
	mock.ExpectBegin().WillReturnError(fmt.Errorf("transaction error"))

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to start transaction")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_UpdatePasswordFailure(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Validate token
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	// Begin transaction
	mock.ExpectBegin()

	// Update password fails
	mock.ExpectExec("UPDATE users").
		WithArgs(sqlmock.AnyArg(), userID).
		WillReturnError(fmt.Errorf("database error"))

	// Rollback
	mock.ExpectRollback()

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to update password")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_NoRowsAffected(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Validate token
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	// Begin transaction
	mock.ExpectBegin()

	// Update password - no rows affected
	mock.ExpectExec("UPDATE users").
		WithArgs(sqlmock.AnyArg(), userID).
		WillReturnResult(sqlmock.NewResult(0, 0))

	// Rollback
	mock.ExpectRollback()

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to update password")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_MarkTokenUsedFailure(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Validate token
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	// Begin transaction
	mock.ExpectBegin()

	// Update password
	mock.ExpectExec("UPDATE users").
		WithArgs(sqlmock.AnyArg(), userID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Mark token as used fails
	mock.ExpectExec("UPDATE reset_tokens").
		WithArgs(1).
		WillReturnError(fmt.Errorf("database error"))

	// Rollback
	mock.ExpectRollback()

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to mark token as used")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_CommitFailure(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Validate token
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	// Begin transaction
	mock.ExpectBegin()

	// Update password
	mock.ExpectExec("UPDATE users").
		WithArgs(sqlmock.AnyArg(), userID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Mark token as used
	mock.ExpectExec("UPDATE reset_tokens").
		WithArgs(1).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Commit fails
	mock.ExpectCommit().WillReturnError(fmt.Errorf("commit error"))

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to commit transaction")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_EmailLookupFailure(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Validate token
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	// Begin transaction
	mock.ExpectBegin()

	// Update password
	mock.ExpectExec("UPDATE users").
		WithArgs(sqlmock.AnyArg(), userID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Mark token as used
	mock.ExpectExec("UPDATE reset_tokens").
		WithArgs(1).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Commit transaction
	mock.ExpectCommit()

	// Get user email fails
	mock.ExpectQuery("SELECT email FROM users").
		WithArgs(userID).
		WillReturnError(fmt.Errorf("database error"))

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	// Should succeed even if email lookup fails (password was already changed)
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_InvalidToken(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "invalid-token"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"

	// Token not found
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnError(sql.ErrNoRows)

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid token")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_WeakPassword(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	weakPassword := "weak"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Validate token - success
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now(), time.Now().Add(1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	err := service.ResetPassword(context.Background(), plainToken, weakPassword, ipAddress)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "password does not meet requirements")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestResetPassword_ExpiredToken(t *testing.T) {
	service, mock, cleanup := setupResetServiceTest(t)
	defer cleanup()

	plainToken := "test-token-123"
	hashedToken := service.tokenGen.HashToken(plainToken)
	newPassword := "NewPass123!@#"
	ipAddress := "192.168.1.1"
	userID := int64(123)

	// Token expired
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "ip_address", "user_agent",
	}).AddRow(
		1, userID, hashedToken, time.Now().Add(-2*time.Hour), time.Now().Add(-1*time.Hour), nil, ipAddress, "test-agent",
	)
	mock.ExpectQuery("SELECT (.+) FROM reset_tokens").
		WithArgs(hashedToken).
		WillReturnRows(rows)

	// Delete expired token
	mock.ExpectExec("DELETE FROM reset_tokens").
		WithArgs(1).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := service.ResetPassword(context.Background(), plainToken, newPassword, ipAddress)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "token expired")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestInvalidateUserSessions(t *testing.T) {
	service, _, cleanup := setupResetServiceTest(t)
	defer cleanup()

	userID := int64(123)

	// This is a placeholder function, should not error
	err := service.InvalidateUserSessions(context.Background(), userID)

	assert.NoError(t, err)
}
