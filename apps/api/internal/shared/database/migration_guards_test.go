package database_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// information_schema spans the whole database, while the statement guarded by
// it acts on the current schema. A guard that does not say which schema it
// means asks a question about somebody else's tables and then acts on ours.
//
// This is not hypothetical: migration 028 asked whether user_foods has a brand
// column, another schema in the same database had one, and the CREATE INDEX
// that followed failed against this schema's table — in CI, where several test
// schemas exist at once, and nowhere else.
func TestMigrationGuardsNameTheirSchema(t *testing.T) {
	// information_schema names the schema column table_schema; the pg_ catalog
	// views name it schemaname.
	predicates := []*regexp.Regexp{
		regexp.MustCompile(`(?is)FROM\s+information_schema\.\w+\s+WHERE\s+(.*?)(?:\)|\bTHEN\b)`),
		regexp.MustCompile(`(?is)FROM\s+(?:pg_tables|pg_indexes|pg_policies|pg_matviews)\s+WHERE\s+(.*?)(?:\)|\bTHEN\b)`),
	}
	column := map[int]string{0: "table_schema", 1: "schemaname"}

	root := filepath.Join("..", "..", "..", "migrations")
	entries, err := os.ReadDir(root)
	require.NoError(t, err)

	var offenders []string
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		source, err := os.ReadFile(filepath.Join(root, entry.Name()))
		require.NoError(t, err)

		for i, predicate := range predicates {
			for _, match := range predicate.FindAllStringSubmatch(string(source), -1) {
				if !strings.Contains(match[1], column[i]) {
					offenders = append(offenders, entry.Name()+": "+strings.Join(strings.Fields(match[1]), " "))
				}
			}
		}
	}

	assert.Empty(t, offenders,
		"name the schema in each (table_schema or schemaname = current_schema()): a guard "+
			"that reads the whole database decides on tables it is not about: %v", offenders)
}
