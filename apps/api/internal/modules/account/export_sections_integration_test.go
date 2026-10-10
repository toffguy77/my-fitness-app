//go:build integration

package account

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
)

// Every section query runs against the real schema. Unit tests mock the
// database, and a mock accepts any column name — this is the check that a
// section still matches the tables it reads.
func TestExportSectionsRunAgainstSchema(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "export_sections")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('export@example.test', 'x', 'Выгрузка', 'client')
		 RETURNING id`).Scan(&userID))

	for _, sec := range sections {
		t.Run(sec.name, func(t *testing.T) {
			rows, err := db.QueryContext(ctx, sec.query, userID)
			require.NoError(t, err)
			for rows.Next() {
			}
			require.NoError(t, rows.Err())
			require.NoError(t, rows.Close())
		})
	}
}
