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

func TestCheckOldStructureExists(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func(sqlmock.Sqlmock)
		expectedResult bool
	}{
		{
			name: "old structure exists",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			},
			expectedResult: true,
		},
		{
			name: "old structure does not exist",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
			},
			expectedResult: false,
		},
		{
			name: "database error",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
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

			result := checkOldStructureExists(db)
			assert.Equal(t, tt.expectedResult, result)
		})
	}
}

func TestCheckNewStructureExists(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func(sqlmock.Sqlmock)
		expectedResult bool
	}{
		{
			name: "new structure exists",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			},
			expectedResult: true,
		},
		{
			name: "new structure does not exist",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
			},
			expectedResult: false,
		},
		{
			name: "database error",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
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

			result := checkNewStructureExists(db)
			assert.Equal(t, tt.expectedResult, result)
		})
	}
}


func TestVerifyTableRenamed(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func(sqlmock.Sqlmock)
		expectedResult bool
	}{
		{
			name: "table renamed successfully",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Old table doesn't exist
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				// New table exists
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			},
			expectedResult: true,
		},
		{
			name: "old table still exists",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Old table still exists
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			},
			expectedResult: false,
		},
		{
			name: "new table not created",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Old table doesn't exist
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				// New table doesn't exist
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
			},
			expectedResult: false,
		},
		{
			name: "error checking old table",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
			},
			expectedResult: false,
		},
		{
			name: "error checking new table",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Old table doesn't exist
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				// Error checking new table
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
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

			result := verifyTableRenamed(db)
			assert.Equal(t, tt.expectedResult, result)
		})
	}
}

func TestVerifyColumnsRenamed(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func(sqlmock.Sqlmock)
		expectedResult bool
	}{
		{
			name: "all columns renamed successfully",
			setupMock: func(mock sqlmock.Sqlmock) {
				// 5 columns to check (curator_client_relationships.curator_id, weekly_plans.curator_id,
				// tasks.curator_id, weekly_reports.curator_id, weekly_reports.curator_feedback)
				for i := 0; i < 5; i++ {
					// New column exists
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
					// Old column doesn't exist
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: true,
		},
		{
			name: "some new columns missing",
			setupMock: func(mock sqlmock.Sqlmock) {
				// First column: new exists, old doesn't
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				// Second column: new doesn't exist
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				// Remaining columns
				for i := 0; i < 3; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
		{
			name: "old columns still exist",
			setupMock: func(mock sqlmock.Sqlmock) {
				// First column: new exists, old still exists
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				// Remaining columns
				for i := 0; i < 4; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
		{
			name: "error checking new column",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Continue with remaining columns
				for i := 0; i < 4; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
		{
			name: "error checking old column",
			setupMock: func(mock sqlmock.Sqlmock) {
				// New column exists
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				// Error checking old column
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Continue with remaining columns
				for i := 0; i < 4; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
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

			result := verifyColumnsRenamed(db)
			assert.Equal(t, tt.expectedResult, result)
		})
	}
}


func TestVerifyIndexesCreated(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func(sqlmock.Sqlmock)
		expectedResult bool
	}{
		{
			name: "all new indexes exist and old removed",
			setupMock: func(mock sqlmock.Sqlmock) {
				// 5 new indexes exist
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// 5 old indexes don't exist
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: true,
		},
		{
			name: "some new indexes missing",
			setupMock: func(mock sqlmock.Sqlmock) {
				// First 3 new indexes exist
				for i := 0; i < 3; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// Last 2 new indexes missing
				for i := 0; i < 2; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
				// Old indexes check
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
		{
			name: "old indexes still exist (warning only)",
			setupMock: func(mock sqlmock.Sqlmock) {
				// All new indexes exist
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// Old indexes still exist (this is a warning, not failure)
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
			},
			expectedResult: true,
		},
		{
			name: "error checking new index",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Continue with remaining indexes
				for i := 0; i < 4; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// Old indexes
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
		{
			name: "error checking old index (continues)",
			setupMock: func(mock sqlmock.Sqlmock) {
				// All new indexes exist
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// Error on first old index check
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Continue with remaining old indexes
				for i := 0; i < 4; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()

			tt.setupMock(mock)

			result := verifyIndexesCreated(db)
			assert.Equal(t, tt.expectedResult, result)
		})
	}
}

func TestVerifyRLSPolicies(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func(sqlmock.Sqlmock)
		expectedResult bool
	}{
		{
			name: "all new policies exist and old removed",
			setupMock: func(mock sqlmock.Sqlmock) {
				// 9 new policies exist
				for i := 0; i < 9; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// 8 old policies don't exist
				for i := 0; i < 8; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: true,
		},
		{
			name: "some new policies missing",
			setupMock: func(mock sqlmock.Sqlmock) {
				// First 5 new policies exist
				for i := 0; i < 5; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// Last 4 new policies missing
				for i := 0; i < 4; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
				// Old policies check
				for i := 0; i < 8; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
		{
			name: "old policies still exist (warning only)",
			setupMock: func(mock sqlmock.Sqlmock) {
				// All new policies exist
				for i := 0; i < 9; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// Old policies still exist (this is a warning, not failure)
				for i := 0; i < 8; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
			},
			expectedResult: true,
		},
		{
			name: "error checking new policy",
			setupMock: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Continue with remaining policies
				for i := 0; i < 8; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// Old policies
				for i := 0; i < 8; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: false,
		},
		{
			name: "error checking old policy (continues)",
			setupMock: func(mock sqlmock.Sqlmock) {
				// All new policies exist
				for i := 0; i < 9; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				}
				// Error on first old policy check
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnError(sql.ErrConnDone)
				// Continue with remaining old policies
				for i := 0; i < 7; i++ {
					mock.ExpectQuery(`SELECT EXISTS`).
						WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				}
			},
			expectedResult: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()

			tt.setupMock(mock)

			result := verifyRLSPolicies(db)
			assert.Equal(t, tt.expectedResult, result)
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
			name: "valid migration file with invalid db url",
			setupFile: func() (string, func()) {
				tmpDir := t.TempDir()
				filePath := filepath.Join(tmpDir, "test_migration.sql")
				content := []byte("CREATE TABLE test_table (id SERIAL PRIMARY KEY);")
				err := os.WriteFile(filePath, content, 0644)
				require.NoError(t, err)
				return filePath, func() {}
			},
			expectError: true,
			errorMsg:    "failed to execute migration",
		},
		{
			name: "empty migration file with invalid db url",
			setupFile: func() (string, func()) {
				tmpDir := t.TempDir()
				filePath := filepath.Join(tmpDir, "empty_migration.sql")
				content := []byte("")
				err := os.WriteFile(filePath, content, 0644)
				require.NoError(t, err)
				return filePath, func() {}
			},
			expectError: true,
			errorMsg:    "failed to execute migration",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			filePath, cleanup := tt.setupFile()
			defer cleanup()

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
		{
			name: "env file with values containing equals sign",
			setupFile: func() (string, func()) {
				tmpDir := t.TempDir()
				filePath := filepath.Join(tmpDir, ".env")
				content := []byte(`
DATABASE_URL=postgres://user:pass=word@localhost/db
CONNECTION_STRING=host=localhost;port=5432
`)
				err := os.WriteFile(filePath, content, 0644)
				require.NoError(t, err)
				return filePath, func() {
					os.Unsetenv("DATABASE_URL")
					os.Unsetenv("CONNECTION_STRING")
				}
			},
			expectError: false,
			checkEnv: map[string]string{
				"DATABASE_URL":      "postgres://user:pass=word@localhost/db",
				"CONNECTION_STRING": "host=localhost;port=5432",
			},
		},
		{
			name: "env file with whitespace around values",
			setupFile: func() (string, func()) {
				tmpDir := t.TempDir()
				filePath := filepath.Join(tmpDir, ".env")
				content := []byte(`
  KEY_WITH_SPACES  =  value_with_spaces  
NORMAL_KEY=normal_value
`)
				err := os.WriteFile(filePath, content, 0644)
				require.NoError(t, err)
				return filePath, func() {
					os.Unsetenv("KEY_WITH_SPACES")
					os.Unsetenv("NORMAL_KEY")
				}
			},
			expectError: false,
			checkEnv: map[string]string{
				"KEY_WITH_SPACES": "value_with_spaces",
				"NORMAL_KEY":      "normal_value",
			},
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
				for key, expectedValue := range tt.checkEnv {
					actualValue := os.Getenv(key)
					assert.Equal(t, expectedValue, actualValue, "Environment variable %s not set correctly", key)
				}
			}
		})
	}
}


// Integration-style test for the complete verification flow
func TestVerificationFunctionsIntegration(t *testing.T) {
	t.Run("complete successful verification flow", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()

		// Setup expectations for verifyTableRenamed
		// Old table doesn't exist
		mock.ExpectQuery(`SELECT EXISTS`).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
		// New table exists
		mock.ExpectQuery(`SELECT EXISTS`).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		// Setup expectations for verifyColumnsRenamed (5 columns)
		for i := 0; i < 5; i++ {
			// New column exists
			mock.ExpectQuery(`SELECT EXISTS`).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			// Old column doesn't exist
			mock.ExpectQuery(`SELECT EXISTS`).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
		}

		// Setup expectations for verifyIndexesCreated
		// 5 new indexes exist
		for i := 0; i < 5; i++ {
			mock.ExpectQuery(`SELECT EXISTS`).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
		}
		// 5 old indexes don't exist
		for i := 0; i < 5; i++ {
			mock.ExpectQuery(`SELECT EXISTS`).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
		}

		// Setup expectations for verifyRLSPolicies
		// 9 new policies exist
		for i := 0; i < 9; i++ {
			mock.ExpectQuery(`SELECT EXISTS`).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
		}
		// 8 old policies don't exist
		for i := 0; i < 8; i++ {
			mock.ExpectQuery(`SELECT EXISTS`).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
		}

		// Run all verification functions
		tableOK := verifyTableRenamed(db)
		columnsOK := verifyColumnsRenamed(db)
		indexesOK := verifyIndexesCreated(db)
		policiesOK := verifyRLSPolicies(db)

		// All should pass
		assert.True(t, tableOK, "Table verification should pass")
		assert.True(t, columnsOK, "Columns verification should pass")
		assert.True(t, indexesOK, "Indexes verification should pass")
		assert.True(t, policiesOK, "Policies verification should pass")

		// Verify all expectations were met
		err = mock.ExpectationsWereMet()
		assert.NoError(t, err)
	})

	t.Run("partial failure verification flow", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer db.Close()

		// Setup expectations for verifyTableRenamed - FAILS
		// Old table still exists
		mock.ExpectQuery(`SELECT EXISTS`).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		// Run verification
		tableOK := verifyTableRenamed(db)

		// Should fail
		assert.False(t, tableOK, "Table verification should fail when old table exists")
	})
}

// Test for checkOldStructureExists and checkNewStructureExists together
func TestMigrationStateDetection(t *testing.T) {
	tests := []struct {
		name              string
		setupMock         func(sqlmock.Sqlmock)
		expectedOldExists bool
		expectedNewExists bool
		description       string
	}{
		{
			name: "pre-migration state",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Old structure exists
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				// New structure doesn't exist
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
			},
			expectedOldExists: true,
			expectedNewExists: false,
			description:       "Migration has not been applied yet",
		},
		{
			name: "post-migration state",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Old structure doesn't exist
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				// New structure exists
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			},
			expectedOldExists: false,
			expectedNewExists: true,
			description:       "Migration has been applied",
		},
		{
			name: "no tables state",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Neither exists
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
			},
			expectedOldExists: false,
			expectedNewExists: false,
			description:       "Dashboard tables not created yet",
		},
		{
			name: "both exist state (unusual)",
			setupMock: func(mock sqlmock.Sqlmock) {
				// Both exist (shouldn't happen normally)
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
				mock.ExpectQuery(`SELECT EXISTS`).
					WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			},
			expectedOldExists: true,
			expectedNewExists: true,
			description:       "Unusual state - both structures exist",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()

			tt.setupMock(mock)

			oldExists := checkOldStructureExists(db)
			newExists := checkNewStructureExists(db)

			assert.Equal(t, tt.expectedOldExists, oldExists, "Old structure check failed: %s", tt.description)
			assert.Equal(t, tt.expectedNewExists, newExists, "New structure check failed: %s", tt.description)
		})
	}
}
