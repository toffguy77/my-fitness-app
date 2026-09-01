//go:build integration

package database_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/migrations"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
)

// Migrations are applied automatically at startup, so a broken one takes the
// service down rather than failing a review. Unit tests run on sqlmock and
// never execute the SQL, which is how migration 036 reached production
// unapplied. These tests run the real files against a real PostgreSQL.
//
// Run with: go test -tags=integration ./internal/shared/database/

func testDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping integration test")
	}
	return dsn
}

// freshDatabase gives each test its own schema so they cannot interfere.
//
// The search_path goes in the connection string, not a SET statement: sql.DB is
// a pool, so SET would apply to whichever single connection ran it and later
// queries would silently land in public — which made tests contaminate each
// other and report "relation already exists".
func freshDatabase(t *testing.T) *database.DB {
	t.Helper()

	admin, err := sql.Open("pgx", testDSN(t))
	require.NoError(t, err)
	defer func() { _ = admin.Close() }()
	require.NoError(t, admin.Ping())

	schema := fmt.Sprintf("mig_test_%d_%d", os.Getpid(), testCounter())
	_, err = admin.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
	require.NoError(t, err)
	_, err = admin.Exec(fmt.Sprintf("CREATE SCHEMA %s", schema))
	require.NoError(t, err)

	// Extensions live in public; keep it on the path so gen_random_uuid and the
	// trigram operators resolve.
	dsn := testDSN(t)
	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	scoped, err := sql.Open("pgx", fmt.Sprintf("%s%ssearch_path=%s,public", dsn, separator, schema))
	require.NoError(t, err)
	require.NoError(t, scoped.Ping())

	t.Cleanup(func() {
		_ = scoped.Close()
		cleanup, err := sql.Open("pgx", testDSN(t))
		if err == nil {
			_, _ = cleanup.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
			_ = cleanup.Close()
		}
	})

	return &database.DB{DB: scoped}
}

var counter int

func testCounter() int { counter++; return counter }

func TestMigrationsApplyToCleanDatabase(t *testing.T) {
	db := freshDatabase(t)

	migrator := database.NewMigrator(db, migrations.FS, logger.New())
	require.NoError(t, migrator.Run(context.Background(), 0), "all up-migrations must apply to an empty database")

	applied, err := migrator.Applied(context.Background())
	require.NoError(t, err)
	require.NotEmpty(t, applied)

	// Every up-migration on disk must be recorded, with no gaps: a version
	// silently skipped is exactly the incident this guards against.
	expected := migrationVersions(t, "_up.sql")
	require.Equal(t, expected, applied, "recorded versions must match the files on disk")
}

func TestMigrationsAreIdempotent(t *testing.T) {
	db := freshDatabase(t)
	migrator := database.NewMigrator(db, migrations.FS, logger.New())

	require.NoError(t, migrator.Run(context.Background(), 0))
	require.NoError(t, migrator.Run(context.Background(), 0), "a second run must be a no-op, not an error")
}

// Down-migrations exist so a bad release can be backed out. They are never
// exercised in normal operation, which is precisely why they rot unnoticed.
func TestMigrationsRollBackInReverse(t *testing.T) {
	db := freshDatabase(t)
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(context.Background(), 0))

	downs := migrationFiles(t, "_down.sql")
	sort.Sort(sort.Reverse(sort.StringSlice(downs)))

	for _, name := range downs {
		body, err := migrations.FS.ReadFile(name)
		require.NoError(t, err)
		_, err = db.ExecContext(context.Background(), string(body))
		require.NoError(t, err, "down-migration %s failed to apply", name)
	}
}

// Each up-migration must have a matching down-migration.
func TestEveryMigrationHasARollback(t *testing.T) {
	ups := migrationVersions(t, "_up.sql")
	downs := migrationVersions(t, "_down.sql")
	require.Equal(t, ups, downs, "every up-migration needs a matching down-migration")
}

var versionPattern = regexp.MustCompile(`^(\d+)_`)

func migrationFiles(t *testing.T, suffix string) []string {
	t.Helper()
	entries, err := migrations.FS.ReadDir(".")
	require.NoError(t, err)

	var out []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".sql" && len(e.Name()) > len(suffix) &&
			e.Name()[len(e.Name())-len(suffix):] == suffix {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	return out
}

func migrationVersions(t *testing.T, suffix string) []int {
	t.Helper()
	var out []int
	for _, name := range migrationFiles(t, suffix) {
		m := versionPattern.FindStringSubmatch(name)
		require.NotNil(t, m, "migration %s has no version prefix", name)
		v, err := strconv.Atoi(m[1])
		require.NoError(t, err)
		out = append(out, v)
	}
	sort.Ints(out)
	return out
}
