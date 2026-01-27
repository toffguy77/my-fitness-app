package database

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresConfig(t *testing.T) {
	t.Run("creates valid config", func(t *testing.T) {
		cfg := PostgresConfig{
			Host:         "localhost",
			Port:         5432,
			Database:     "testdb",
			User:         "testuser",
			Password:     "testpass",
			SSLMode:      "disable",
			MaxOpenConns: 25,
			MaxIdleConns: 5,
		}

		assert.Equal(t, "localhost", cfg.Host)
		assert.Equal(t, 5432, cfg.Port)
		assert.Equal(t, "testdb", cfg.Database)
		assert.Equal(t, "testuser", cfg.User)
		assert.Equal(t, "disable", cfg.SSLMode)
		assert.Equal(t, 25, cfg.MaxOpenConns)
		assert.Equal(t, 5, cfg.MaxIdleConns)
	})

	t.Run("config with different SSL modes", func(t *testing.T) {
		sslModes := []string{"disable", "require", "verify-ca", "verify-full"}

		for _, mode := range sslModes {
			cfg := PostgresConfig{
				Host:    "localhost",
				Port:    5432,
				SSLMode: mode,
			}
			assert.Equal(t, mode, cfg.SSLMode)
		}
	})
}

func TestNewPostgres_InvalidConnection(t *testing.T) {
	t.Run("fails with invalid host", func(t *testing.T) {
		cfg := PostgresConfig{
			Host:         "invalid-host-that-does-not-exist",
			Port:         5432,
			Database:     "testdb",
			User:         "testuser",
			Password:     "testpass",
			SSLMode:      "disable",
			MaxOpenConns: 25,
			MaxIdleConns: 5,
		}

		db, err := NewPostgres(cfg)
		assert.Error(t, err)
		assert.Nil(t, db)
	})
}

func TestNewPostgresFromURL_InvalidURL(t *testing.T) {
	t.Run("fails with invalid URL", func(t *testing.T) {
		db, err := NewPostgresFromURL("invalid-url", 25, 5)
		assert.Error(t, err)
		assert.Nil(t, db)
	})
}

func TestDB_Health(t *testing.T) {
	t.Run("successful health check", func(t *testing.T) {
		// Create mock database
		mockDB, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
		require.NoError(t, err)
		defer mockDB.Close()

		// Expect ping
		mock.ExpectPing()

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Test health check
		ctx := context.Background()
		err = db.Health(ctx)

		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("failed health check", func(t *testing.T) {
		// Create mock database
		mockDB, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
		require.NoError(t, err)
		defer mockDB.Close()

		// Expect ping to fail
		mock.ExpectPing().WillReturnError(sql.ErrConnDone)

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Test health check
		ctx := context.Background()
		err = db.Health(ctx)

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "database health check failed")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("health check with timeout", func(t *testing.T) {
		// Create mock database
		mockDB, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
		require.NoError(t, err)
		defer mockDB.Close()

		// Expect ping
		mock.ExpectPing()

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Test health check with short timeout
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()

		err = db.Health(ctx)

		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestDB_Stats(t *testing.T) {
	t.Run("returns database statistics", func(t *testing.T) {
		// Create mock database
		mockDB, _, err := sqlmock.New()
		require.NoError(t, err)
		defer mockDB.Close()

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Get stats
		stats := db.Stats()

		// Verify stats structure
		assert.NotNil(t, stats)
		assert.GreaterOrEqual(t, stats.MaxOpenConnections, 0)
		assert.GreaterOrEqual(t, stats.OpenConnections, 0)
		assert.GreaterOrEqual(t, stats.InUse, 0)
		assert.GreaterOrEqual(t, stats.Idle, 0)
	})

	t.Run("stats reflect connection pool settings", func(t *testing.T) {
		// Create mock database
		mockDB, _, err := sqlmock.New()
		require.NoError(t, err)
		defer mockDB.Close()

		// Set connection pool settings
		mockDB.SetMaxOpenConns(25)
		mockDB.SetMaxIdleConns(5)

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Get stats
		stats := db.Stats()

		// Verify max connections
		assert.Equal(t, 25, stats.MaxOpenConnections)
	})
}

func TestDB_Query(t *testing.T) {
	t.Run("successful query execution", func(t *testing.T) {
		// Create mock database
		mockDB, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer mockDB.Close()

		// Expect query
		rows := sqlmock.NewRows([]string{"id", "name"}).
			AddRow(1, "Test User")
		mock.ExpectQuery("SELECT (.+) FROM users").WillReturnRows(rows)

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Execute query
		result, err := db.Query("SELECT id, name FROM users WHERE id = $1", 1)
		require.NoError(t, err)
		defer result.Close()

		// Verify results
		assert.True(t, result.Next())

		var id int
		var name string
		err = result.Scan(&id, &name)
		require.NoError(t, err)
		assert.Equal(t, 1, id)
		assert.Equal(t, "Test User", name)

		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestDB_Exec(t *testing.T) {
	t.Run("successful exec", func(t *testing.T) {
		// Create mock database
		mockDB, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer mockDB.Close()

		// Expect exec
		mock.ExpectExec("INSERT INTO users").
			WithArgs("test@example.com", "Test User").
			WillReturnResult(sqlmock.NewResult(1, 1))

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Execute statement
		result, err := db.Exec("INSERT INTO users (email, name) VALUES ($1, $2)",
			"test@example.com", "Test User")
		require.NoError(t, err)

		// Verify result
		rowsAffected, err := result.RowsAffected()
		require.NoError(t, err)
		assert.Equal(t, int64(1), rowsAffected)

		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestDB_Transaction(t *testing.T) {
	t.Run("successful transaction", func(t *testing.T) {
		// Create mock database
		mockDB, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer mockDB.Close()

		// Expect transaction
		mock.ExpectBegin()
		mock.ExpectExec("INSERT INTO users").
			WillReturnResult(sqlmock.NewResult(1, 1))
		mock.ExpectCommit()

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Begin transaction
		tx, err := db.Begin()
		require.NoError(t, err)

		// Execute in transaction
		_, err = tx.Exec("INSERT INTO users (email) VALUES ($1)", "test@example.com")
		require.NoError(t, err)

		// Commit
		err = tx.Commit()
		require.NoError(t, err)

		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("transaction rollback", func(t *testing.T) {
		// Create mock database
		mockDB, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer mockDB.Close()

		// Expect transaction with rollback
		mock.ExpectBegin()
		mock.ExpectExec("INSERT INTO users").
			WillReturnError(sql.ErrConnDone)
		mock.ExpectRollback()

		// Wrap in our DB type
		db := &DB{DB: mockDB}

		// Begin transaction
		tx, err := db.Begin()
		require.NoError(t, err)

		// Execute in transaction (will fail)
		_, err = tx.Exec("INSERT INTO users (email) VALUES ($1)", "test@example.com")
		assert.Error(t, err)

		// Rollback
		err = tx.Rollback()
		require.NoError(t, err)

		assert.NoError(t, mock.ExpectationsWereMet())
	})
}
