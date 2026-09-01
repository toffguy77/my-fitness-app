//go:build integration

package account_test

import (
	"context"
	"database/sql"
	"os"
	"sort"
	"testing"

	"github.com/burcev/api/internal/modules/account"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A table that references users but has no erasure strategy is how personal
// data gets forgotten: nobody notices until someone asks why their data is
// still there. This test compares the strategy list against the live schema, so
// adding such a table fails the build.
//
// Run with: go test -tags=integration ./internal/modules/account/
func TestErasureCoversSchema(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping integration test")
	}

	db, err := sql.Open("pgx", dsn)
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	require.NoError(t, db.Ping())

	rows, err := db.Query(`
		SELECT DISTINCT tc.table_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.constraint_column_usage ccu
		  ON tc.constraint_name = ccu.constraint_name
		 AND tc.table_schema = ccu.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY'
		  AND ccu.table_name = 'users'
		  AND tc.table_schema = current_schema()`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	covered := map[string]bool{}
	for _, ts := range account.Strategies() {
		covered[ts.Table] = true
	}

	var uncovered []string
	for rows.Next() {
		var table string
		require.NoError(t, rows.Scan(&table))
		if table == "users" {
			continue // the account row itself is handled explicitly
		}
		if !covered[table] {
			uncovered = append(uncovered, table)
		}
	}
	require.NoError(t, rows.Err())

	sort.Strings(uncovered)
	assert.Empty(t, uncovered,
		"tables reference users but have no erasure strategy; decide delete/anonymize/keep for each: %v",
		uncovered)
}

// Every strategy must state why, because "why is this kept?" is the question an
// audit asks and the answer must not live only in someone's memory.
func TestEveryStrategyStatesAReason(t *testing.T) {
	for _, ts := range account.Strategies() {
		assert.NotEmpty(t, ts.Reason, "table %s has no recorded reason", ts.Table)
	}
}

var _ = context.Background
