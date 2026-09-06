//go:build integration

package curator_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The snapshot jobs exist to fill the curator's history and benchmark screens.
// Nothing checked that what the jobs write is what those screens read, and the
// two sit in different files with no shared type between them — a column
// renamed on one side would simply produce an empty screen.
func TestSnapshotJobsFillTheCuratorsHistory(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "snapshots")
	ctx := context.Background()
	service := curator.NewService(db, logger.New(), nil)

	var curatorID, clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('snapshot-curator@example.test', 'x', 'Куратор', 'coordinator') RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('snapshot-client@example.test', 'x', 'Клиент', 'client') RETURNING id`).Scan(&clientID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status)
		 VALUES ($1, $2, 'active')`, curatorID, clientID)
	require.NoError(t, err)

	t.Run("history is empty before the job has ever run", func(t *testing.T) {
		history, err := service.GetAnalyticsHistory(ctx, curatorID, "daily", 30)
		require.NoError(t, err, "an empty history is a state to show, not an error")
		assert.NotNil(t, history)
	})

	t.Run("the daily job fills the daily history", func(t *testing.T) {
		collected, err := service.CollectAllDailySnapshots(ctx)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, collected, 1, "a curator with an active client must be collected")

		var rows int
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT count(*) FROM curator_daily_snapshots WHERE curator_id = $1`, curatorID).Scan(&rows))
		assert.Equal(t, 1, rows)

		history, err := service.GetAnalyticsHistory(ctx, curatorID, "daily", 30)
		require.NoError(t, err)
		require.NotNil(t, history)
		assert.NotEmpty(t, history, "the screen reads what the job wrote")
	})

	t.Run("running the daily job twice does not double the day", func(t *testing.T) {
		_, err := service.CollectAllDailySnapshots(ctx)
		require.NoError(t, err)

		var rows int
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT count(*) FROM curator_daily_snapshots WHERE curator_id = $1`, curatorID).Scan(&rows))
		assert.Equal(t, 1, rows, "a re-run must update the day, not add another one")
	})

	t.Run("the weekly job fills the benchmark", func(t *testing.T) {
		collected, err := service.CollectAllWeeklySnapshots(ctx)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, collected, 1)

		data, err := service.GetBenchmark(ctx, curatorID, 12)
		require.NoError(t, err)
		require.NotNil(t, data)
		assert.NotEmpty(t, data.OwnSnapshots, "the curator's own weekly figures must come back")
		assert.NotEmpty(t, data.PlatformBenchmarks,
			"the comparison is the point of the screen; without it there is nothing to compare against")
	})
}
