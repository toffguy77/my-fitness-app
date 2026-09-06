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
	predicate := regexp.MustCompile(`(?is)FROM\s+information_schema\.\w+\s+WHERE\s+(.*?)(?:\)|\bTHEN\b)`)

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

		for _, match := range predicate.FindAllStringSubmatch(string(source), -1) {
			if !strings.Contains(match[1], "table_schema") {
				offenders = append(offenders, entry.Name()+": "+strings.Join(strings.Fields(match[1]), " "))
			}
		}
	}

	assert.Empty(t, offenders,
		"add `table_schema = current_schema()` to each: a guard that reads the whole "+
			"database decides on tables it is not about: %v", offenders)
}
