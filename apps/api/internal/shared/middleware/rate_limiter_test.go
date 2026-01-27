package middleware

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupRateLimiterTest(t *testing.T) (*RateLimiter, sqlmock.Sqlmock, func()) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	log := logger.New()
	rl := NewRateLimiter(db, log)

	cleanup := func() {
		db.Close()
	}

	return rl, mock, cleanup
}

func TestNewRateLimiter(t *testing.T) {
	db, _, cleanup := setupRateLimiterTest(t)
	defer cleanup()

	assert.NotNil(t, db)
}

func TestCheckEmailRateLimit(t *testing.T) {
	tests := []struct {
		name          string
		email         string
		attemptCount  int
		expectError   bool
		errorContains string
		mockError     error
	}{
		{
			name:         "No attempts - should pass",
			email:        "user@example.com",
			attemptCount: 0,
			expectError:  false,
		},
		{
			name:         "One attempt - should pass",
			email:        "user@example.com",
			attemptCount: 1,
			expectError:  false,
		},
		{
			name:         "Two attempts - should pass",
			email:        "user@example.com",
			attemptCount: 2,
			expectError:  false,
		},
		{
			name:          "Three attempts - should fail (at limit)",
			email:         "user@example.com",
			attemptCount:  3,
			expectError:   true,
			errorContains: "rate limit exceeded",
		},
		{
			name:          "Four attempts - should fail (over limit)",
			email:         "user@example.com",
			attemptCount:  4,
			expectError:   true,
			errorContains: "rate limit exceeded",
		},
		{
			name:          "Database error",
			email:         "user@example.com",
			mockError:     sql.ErrConnDone,
			expectError:   true,
			errorContains: "failed to check rate limit",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rl, mock, cleanup := setupRateLimiterTest(t)
			defer cleanup()

			expectation := mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
				WithArgs(tt.email)

			if tt.mockError != nil {
				expectation.WillReturnError(tt.mockError)
			} else {
				expectation.WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(tt.attemptCount))
			}

			err := rl.CheckEmailRateLimit(context.Background(), tt.email)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
			} else {
				assert.NoError(t, err)
			}

			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestCheckIPRateLimit(t *testing.T) {
	tests := []struct {
		name          string
		ipAddress     string
		attemptCount  int
		expectError   bool
		errorContains string
		mockError     error
	}{
		{
			name:         "No attempts - should pass",
			ipAddress:    "192.168.1.1",
			attemptCount: 0,
			expectError:  false,
		},
		{
			name:         "Five attempts - should pass",
			ipAddress:    "192.168.1.1",
			attemptCount: 5,
			expectError:  false,
		},
		{
			name:         "Nine attempts - should pass",
			ipAddress:    "192.168.1.1",
			attemptCount: 9,
			expectError:  false,
		},
		{
			name:          "Ten attempts - should fail (at limit)",
			ipAddress:     "192.168.1.1",
			attemptCount:  10,
			expectError:   true,
			errorContains: "rate limit exceeded",
		},
		{
			name:          "Fifteen attempts - should fail (over limit)",
			ipAddress:     "192.168.1.1",
			attemptCount:  15,
			expectError:   true,
			errorContains: "rate limit exceeded",
		},
		{
			name:          "Database error",
			ipAddress:     "192.168.1.1",
			mockError:     sql.ErrConnDone,
			expectError:   true,
			errorContains: "failed to check rate limit",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rl, mock, cleanup := setupRateLimiterTest(t)
			defer cleanup()

			expectation := mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
				WithArgs(tt.ipAddress)

			if tt.mockError != nil {
				expectation.WillReturnError(tt.mockError)
			} else {
				expectation.WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(tt.attemptCount))
			}

			err := rl.CheckIPRateLimit(context.Background(), tt.ipAddress)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
			} else {
				assert.NoError(t, err)
			}

			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestRecordResetAttempt(t *testing.T) {
	tests := []struct {
		name      string
		email     string
		ipAddress string
		mockError error
	}{
		{
			name:      "Successfully record attempt",
			email:     "user@example.com",
			ipAddress: "192.168.1.1",
			mockError: nil,
		},
		{
			name:      "Database error",
			email:     "user@example.com",
			ipAddress: "192.168.1.1",
			mockError: sql.ErrConnDone,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rl, mock, cleanup := setupRateLimiterTest(t)
			defer cleanup()

			expectation := mock.ExpectExec("INSERT INTO password_reset_attempts").
				WithArgs(tt.email, tt.ipAddress)

			if tt.mockError != nil {
				expectation.WillReturnError(tt.mockError)
			} else {
				expectation.WillReturnResult(sqlmock.NewResult(1, 1))
			}

			err := rl.RecordResetAttempt(context.Background(), tt.email, tt.ipAddress)

			if tt.mockError != nil {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}

			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestCleanupOldAttempts(t *testing.T) {
	tests := []struct {
		name          string
		rowsAffected  int64
		expectError   bool
		mockError     error
		mockRowsError error
	}{
		{
			name:         "No old attempts",
			rowsAffected: 0,
			expectError:  false,
		},
		{
			name:         "Cleanup 5 attempts",
			rowsAffected: 5,
			expectError:  false,
		},
		{
			name:         "Cleanup 100 attempts",
			rowsAffected: 100,
			expectError:  false,
		},
		{
			name:        "Database error",
			mockError:   sql.ErrConnDone,
			expectError: true,
		},
		{
			name:          "RowsAffected error",
			rowsAffected:  5,
			mockRowsError: sql.ErrNoRows,
			expectError:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rl, mock, cleanup := setupRateLimiterTest(t)
			defer cleanup()

			expectation := mock.ExpectExec("DELETE FROM password_reset_attempts")

			if tt.mockError != nil {
				expectation.WillReturnError(tt.mockError)
			} else if tt.mockRowsError != nil {
				expectation.WillReturnResult(sqlmock.NewErrorResult(tt.mockRowsError))
			} else {
				expectation.WillReturnResult(sqlmock.NewResult(0, tt.rowsAffected))
			}

			count, err := rl.CleanupOldAttempts(context.Background())

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, int(tt.rowsAffected), count)
			}

			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestGetAttemptCount(t *testing.T) {
	tests := []struct {
		name           string
		email          string
		ipAddress      string
		emailCount     int
		ipCount        int
		emailError     error
		ipError        error
		expectError    bool
		errorContains  string
	}{
		{
			name:       "Both counts successful",
			email:      "user@example.com",
			ipAddress:  "192.168.1.1",
			emailCount: 2,
			ipCount:    5,
		},
		{
			name:          "Email query error",
			email:         "user@example.com",
			ipAddress:     "192.168.1.1",
			emailError:    sql.ErrConnDone,
			expectError:   true,
			errorContains: "failed to get email count",
		},
		{
			name:          "IP query error",
			email:         "user@example.com",
			ipAddress:     "192.168.1.1",
			emailCount:    2,
			ipError:       sql.ErrConnDone,
			expectError:   true,
			errorContains: "failed to get IP count",
		},
		{
			name:       "Zero counts",
			email:      "new@example.com",
			ipAddress:  "10.0.0.1",
			emailCount: 0,
			ipCount:    0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rl, mock, cleanup := setupRateLimiterTest(t)
			defer cleanup()

			emailExpectation := mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
				WithArgs(tt.email)

			if tt.emailError != nil {
				emailExpectation.WillReturnError(tt.emailError)
			} else {
				emailExpectation.WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(tt.emailCount))

				ipExpectation := mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM password_reset_attempts").
					WithArgs(tt.ipAddress)

				if tt.ipError != nil {
					ipExpectation.WillReturnError(tt.ipError)
				} else {
					ipExpectation.WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(tt.ipCount))
				}
			}

			emailCount, ipCount, err := rl.GetAttemptCount(context.Background(), tt.email, tt.ipAddress)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.emailCount, emailCount)
				assert.Equal(t, tt.ipCount, ipCount)
			}

			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestGetRecentAttempts(t *testing.T) {
	tests := []struct {
		name          string
		limit         int
		setupRows     func() *sqlmock.Rows
		expectError   bool
		errorContains string
		expectedCount int
	}{
		{
			name:  "Get 2 recent attempts",
			limit: 10,
			setupRows: func() *sqlmock.Rows {
				now := time.Now()
				return sqlmock.NewRows([]string{"id", "email", "ip_address", "attempted_at"}).
					AddRow(1, "user1@example.com", "192.168.1.1", now).
					AddRow(2, "user2@example.com", "192.168.1.2", now.Add(-5*time.Minute))
			},
			expectedCount: 2,
		},
		{
			name:  "No attempts",
			limit: 10,
			setupRows: func() *sqlmock.Rows {
				return sqlmock.NewRows([]string{"id", "email", "ip_address", "attempted_at"})
			},
			expectedCount: 0,
		},
		{
			name:          "Query error",
			limit:         10,
			expectError:   true,
			errorContains: "failed to get recent attempts",
		},
		{
			name:  "Scan error",
			limit: 10,
			setupRows: func() *sqlmock.Rows {
				return sqlmock.NewRows([]string{"id", "email", "ip_address", "attempted_at"}).
					AddRow(1, "user1@example.com", "192.168.1.1", "invalid-time")
			},
			expectError:   true,
			errorContains: "failed to scan attempt",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rl, mock, cleanup := setupRateLimiterTest(t)
			defer cleanup()

			expectation := mock.ExpectQuery("SELECT id, email, ip_address, attempted_at FROM password_reset_attempts").
				WithArgs(tt.limit)

			if tt.expectError && tt.setupRows == nil {
				expectation.WillReturnError(sql.ErrConnDone)
			} else if tt.setupRows != nil {
				expectation.WillReturnRows(tt.setupRows())
			}

			attempts, err := rl.GetRecentAttempts(context.Background(), tt.limit)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
			} else {
				assert.NoError(t, err)
				assert.Len(t, attempts, tt.expectedCount)
				if tt.expectedCount > 0 {
					assert.Equal(t, "user1@example.com", attempts[0].Email)
				}
			}

			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestDefaultRateLimitConfig(t *testing.T) {
	config := DefaultRateLimitConfig()

	assert.Equal(t, 3, config.EmailLimit)
	assert.Equal(t, 10, config.IPLimit)
	assert.Equal(t, 60, config.WindowMinutes)
}
