//go:build integration

package testaccounts_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/shared/testaccounts"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/require"
)

// Находится служебный куратор с живым клиентом — и только он.
//
// Назначение такую пару больше не создаёт, но создать её можно правкой в
// базе или строкой, оставшейся с прежних времён: 23 сентября на проде два
// из трёх кандидатов с нулём клиентов были служебными, и любой из них мог
// получить живого человека. Взгляд в таблицу существует затем, чтобы это
// было видно, даже если создал связку не тот код, который мы чинили.
func TestServingRealClientsFindsOnlyRealHarm(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "testaccounts_serving")
	ctx := context.Background()

	user := func(email, role string) int64 {
		t.Helper()
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role, email_verified)
			 VALUES ($1, 'x', 'Кто-то', $2, true) RETURNING id`, email, role).Scan(&id))
		return id
	}
	link := func(curatorID, clientID int64) {
		t.Helper()
		_, err := db.ExecContext(ctx,
			`INSERT INTO curator_client_relationships (curator_id, client_id, status)
			 VALUES ($1, $2, 'active')`, curatorID, clientID)
		require.NoError(t, err)
	}

	testCurator := user("e2e-curator@burcev.team", "coordinator")
	liveCurator := user("live@example.test", "coordinator")

	link(testCurator, user("real-person@example.test", "client"))  // вред
	link(testCurator, user("e2e-client@burcev.test", "client"))    // норма прогона
	link(liveCurator, user("other-person@example.test", "client")) // норма

	// Удалённый клиент за собой куратора не держит.
	gone := user("gone@example.test", "client")
	link(testCurator, gone)
	_, err := db.ExecContext(ctx, `UPDATE users SET deleted_at = NOW() WHERE id = $1`, gone)
	require.NoError(t, err)

	found, err := testaccounts.ServingRealClients(ctx, db.DB)
	require.NoError(t, err)
	require.Equal(t, map[string]int{"e2e-curator@burcev.team": 1}, found)
}
