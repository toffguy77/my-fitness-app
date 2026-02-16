//go:build ignore

package main

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckTablesExist(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func(sqlmock.Sqlmock)
		expectedResult bool
	}{
		{
			name: "no tables exist",
			setupMock: func(mock sqlmock.Sqlmock) {
				// All tables return false
				for i := 0; i < 6; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
		{
			name: "one table exists",
			setupMock: func(mock sqlmock.Sqlmock) {
				// First table exists
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			},
			expectedResult: true,
		},
		{
			name: "all tables exist",
			setupMock: func(mock sqlmock.Sqlmock) {
				// First table exists (function returns early)
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			},
			expectedResult: true,
		},
		{
			name: "database error on first check",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Error on first query, continues to next
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Second query returns false
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				// Continue for remaining tables
				for i := 0; i < 4; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()

			tt.setupMock(mock)

			result := checkTablesExist(db)
			assert.Equal(t, tt.expectedResult, result)

			// Note: We don't check ExpectationsWereMet() because the function
			// may return early when it finds an existing table
		})
	}
}

func TestVerifyTablesCreated(t *testing.T) {
	tests := []struct {
		name      string
		setupMock func(sqlmock.Sqlmock)
	}{
		{
			name: "all tables exist",
			setupMock: func(mock sqlmock.Sqlmock) {
				// All 6 tables exist
				for i := 0; i < 6; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
			},
		},
		{
			name: "some tables missing",
			setupMock: func(mock sqlmock.Sqlmock) {
				// First 3 exist, last 3 don't
				for i := 0; i < 3; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				for i := 0; i < 3; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
		},
		{
			name: "database error",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Error on first query
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Rest succeed
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()

			tt.setupMock(mock)

			// This function prints output, we're just testing it doesn't panic
			verifyTablesCreated(db)

			err = mock.ExpectationsWereMet()
			assert.NoError(t, err)
		})
	}
}

func TestVerifyRLSPolicies(t *testing.T) {
	tests := []struct {
		name      string
		setupMock func(sqlmock.Sqlmock)
	}{
		{
			name: "all tables have RLS enabled",
			setupMock: func(mock sqlmock.Sqlmock) {
				// All 6 tables have RLS enabled
				for i := 0; i < 6; i++ {
					mock.ExpectQuery(`SELECT rowsecurity FROM pg_tables`).
						WillReturnRows(sqlmock.NewRows([]string{"rowsecurity"}).AddRow(true))
					// Each table has 3 policies
					mock.ExpectQuery(`SELECT COUNT\(\*\) FROM pg_policies`).
						WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
				}
			},
		},
		{
			name: "some tables missing RLS",
			setupMock: func(mock sqlmock.Sqlmock) {
				// First 3 have RLS, last 3 don't
				for i := 0; i < 3; i++ {
					mock.ExpectQuery(`SELECT rowsecurity FROM pg_tables`).
						WillReturnRows(sqlmock.NewRows([]string{"rowsecurity"}).AddRow(true))
					mock.ExpectQuery(`SELECT COUNT\(\*\) FROM pg_policies`).
						WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
				}
				for i := 0; i < 3; i++ {
					mock.ExpectQuery(`SELECT rowsecurity FROM pg_tables`).
						WillReturnRows(sqlmock.NewRows([]string{"rowsecurity"}).AddRow(false))
				}
			},
		},
		{
			name: "database error",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Error on first query
				mock.ExpectQuery(`SELECT rowsecurity FROM pg_tables`).
					WillReturnError(sql.ErrConnDone)
				// Rest succeed
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT rowsecurity FROM pg_tables`).
						WillReturnRows(sqlmock.NewRows([]string{"rowsecurity"}).AddRow(true))
					mock.ExpectQuery(`SELECT COUNT\(\*\) FROM pg_policies`).
						WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()

			tt.setupMock(mock)

			// This function prints output, we're just testing it doesn't panic
			verifyRLSPolicies(db)

			err = mock.ExpectationsWereMet()
			assert.NoError(t, err)
		})
	}
}

func TestVerifyIndexes(t *testing.T) {
	tests := []struct {
		name      string
		setupMock func(sqlmock.Sqlmock)
	}{
		{
			name: "all indexes exist",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Total of 14 indexes across all tables
				for i := 0; i < 14; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
			},
		},
		{
			name: "some indexes missing",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Half exist, half don't
				for i := 0; i < 7; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				for i := 0; i < 7; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
		},
		{
			name: "database error",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Error on first query
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Rest succeed
				for i := 0; i < 13; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()

			tt.setupMock(mock)

			// This function prints output, we're just testing it doesn't panic
			verifyIndexes(db)

			err = mock.ExpectationsWereMet()
			assert.NoError(t, err)
		})
	}
}

func TestRunMigrationFile(t *testing.T) {
	tests := []struct {
		name        string
		setupFile   func() (string, func())
		expectError bool
		errorMsg    string
	}{
		{
			name: "file not found",
			setupFile: func() (string, func()) {
				return "nonexistent.sql", func() {}
			},
			expectError: true,
			errorMsg:    "migration file not found",
		},
		{
			name: "valid migration file",
			setupFile: func() (string, func()) {
				// Create temporary migration file
				tmpDir := t.TempDir()
				filePath := filepath.Join(tmpDir, "test_migration.sql")
				content := []byte("CREATE TABLE test_table (id SERIAL PRIMARY KEY);")
				err := os.WriteFile(filePath, content, 0644)
				require.NoError(t, err)
				return filePath, func() {}
			},
			expectError: true, // Will fail because we can't connect to real DB
			errorMsg:    "failed to execute migration",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			filePath, cleanup := tt.setupFile()
			defer cleanup()

			// Use invalid DB URL to test error handling
			err := runMigrationFile("invalid-db-url", filePath)

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorMsg != "" {
					assert.Contains(t, err.Error(), tt.errorMsg)
				}
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestLoadEnv(t *testing.T) {
	tests := []struct {
		name        string
		setupFile   func() (string, func())
		expectError bool
		checkEnv    map[string]string
	}{
		{
			name: "file not found",
			setupFile: func() (string, func()) {
				return "nonexistent.env", func() {}
			},
			expectError: true,
		},
		{
			name: "valid env file",
			setupFile: func() (string, func()) {
				tmpDir := t.TempDir()
				filePath := filepath.Join(tmpDir, ".env")
				content := []byte(`
# Comment line
DATABASE_URL=postgres://localhost/test
API_KEY=secret123

EMPTY_LINE_ABOVE=value
`)
				err := os.WriteFile(filePath, content, 0644)
				require.NoError(t, err)
				return filePath, func() {
					os.Unsetenv("DATABASE_URL")
					os.Unsetenv("API_KEY")
					os.Unsetenv("EMPTY_LINE_ABOVE")
				}
			},
			expectError: false,
			checkEnv: map[string]string{
				"DATABASE_URL":     "postgres://localhost/test",
				"API_KEY":          "secret123",
				"EMPTY_LINE_ABOVE": "value",
			},
		},
		{
			name: "env file with invalid lines",
			setupFile: func() (string, func()) {
				tmpDir := t.TempDir()
				filePath := filepath.Join(tmpDir, ".env")
				content := []byte(`
VALID_KEY=valid_value
INVALID_LINE_NO_EQUALS
ANOTHER_VALID=value2
`)
				err := os.WriteFile(filePath, content, 0644)
				require.NoError(t, err)
				return filePath, func() {
					os.Unsetenv("VALID_KEY")
					os.Unsetenv("ANOTHER_VALID")
				}
			},
			expectError: false,
			checkEnv: map[string]string{
				"VALID_KEY":     "valid_value",
				"ANOTHER_VALID": "value2",
			},
		},
		{
			name: "empty env file",
			setupFile: func() (string, func()) {
				tmpDir := t.TempDir()
				filePath := filepath.Join(tmpDir, ".env")
				content := []byte("")
				err := os.WriteFile(filePath, content, 0644)
				require.NoError(t, err)
				return filePath, func() {}
			},
			expectError: false,
			checkEnv:    map[string]string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			filePath, cleanup := tt.setupFile()
			defer cleanup()

			err := loadEnv(filePath)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				// Check environment variables were set correctly
				for key, expectedValue := range tt.checkEnv {
					actualValue := os.Getenv(key)
					assert.Equal(t, expectedValue, actualValue, "Environment variable %s not set correctly", key)
				}
			}
		})
	}
}

// Integration-style test for the verification functions
func TestVerificationFunctionsIntegration(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	t.Run("complete verification flow", func(t *testing.T) {
		// Setup expectations for verifyTablesCreated
		for i := 0; i < 6; i++ {
			mock.ExpectQuery(`SELECT EXISTS`).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
		}

		// Setup expectations for verifyRLSPolicies
		for i := 0; i < 6; i++ {
			mock.ExpectQuery(`SELECT rowsecurity FROM pg_tables`).
				WillReturnRows(sqlmock.NewRows([]string{"rowsecurity"}).AddRow(true))
			mock.ExpectQuery(`SELECT COUNT\(\*\) FROM pg_policies`).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
		}

		// Setup expectations for verifyIndexes (14 total)
		for i := 0; i < 14; i++ {
			mock.ExpectQuery(`SELECT EXISTS`).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
		}

		// Run all verification functions
		verifyTablesCreated(db)
		verifyRLSPolicies(db)
		verifyIndexes(db)

		// Verify all expectations were met
		err = mock.ExpectationsWereMet()
		assert.NoError(t, err)
	})
}
