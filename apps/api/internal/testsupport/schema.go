//go:build integration

// Package testsupport builds a real database for integration tests.
//
// It exists because sqlmock will happily accept a query naming a column that
// does not exist: the notification timezone was read from the wrong table for
// weeks with a green suite, and every notification silently failed. A test that
// wants to prove something about SQL has to run it against the real schema.
package testsupport

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/migrations"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
)

// SchemaWithMigrations gives the test its own schema with every migration
// applied, dropped again when the test ends. The prefix keeps parallel packages
// out of each other's way.
func SchemaWithMigrations(t *testing.T, prefix string) *database.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping integration test")
	}

	admin, err := sql.Open("pgx", dsn)
	require.NoError(t, err)
	defer func() { _ = admin.Close() }()
	require.NoError(t, admin.Ping())

	// Extensions belong to one schema for the whole database. Installed from a
	// migration running inside a test schema, the first package to get there
	// owns it and every other package's search_path cannot see it. Putting it
	// in public first makes the migration's IF NOT EXISTS a no-op and keeps
	// gin_trgm_ops reachable from everywhere.
	_, err = admin.Exec("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public")
	require.NoError(t, err)

	schema := fmt.Sprintf("%s_test_%d", prefix, os.Getpid())
	_, err = admin.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
	require.NoError(t, err)
	_, err = admin.Exec(fmt.Sprintf("CREATE SCHEMA %s", schema))
	require.NoError(t, err)

	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	scoped, err := sql.Open("pgx", fmt.Sprintf("%s%ssearch_path=%s,public", dsn, separator, schema))
	require.NoError(t, err)
	require.NoError(t, scoped.Ping())

	t.Cleanup(func() {
		_ = scoped.Close()
		if cleanup, err := sql.Open("pgx", dsn); err == nil {
			_, _ = cleanup.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
			_ = cleanup.Close()
		}
	})

	db := &database.DB{DB: scoped}
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).
		Run(context.Background(), 0))
	return db
}
