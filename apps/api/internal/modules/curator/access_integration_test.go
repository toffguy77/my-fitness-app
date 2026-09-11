//go:build integration

package curator_test

import (
	"context"
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Row-level security was switched off by migration 015, so a curator reaching
// somebody else's client is stopped by the relationship check and nothing else.
// A mock cannot show that the check is wired into each route's service call —
// it answers whatever the test tells it to.
func TestCuratorReachesOnlyTheirOwnClients(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "curator")
	ctx := context.Background()
	service := curator.NewService(db, logger.New(), nil)

	newUser := func(email, role string) int64 {
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', $1, $2) RETURNING id`,
			email, role).Scan(&id))
		return id
	}

	mine := newUser("mine-curator@example.test", "coordinator")
	other := newUser("other-curator@example.test", "coordinator")
	client := newUser("their-client@example.test", "client")

	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status)
		 VALUES ($1, $2, 'active')`, mine, client)
	require.NoError(t, err)

	plan := curator.CreateWeeklyPlanRequest{
		Calories:  2000,
		Protein:   150,
		Fat:       60,
		Carbs:     200,
		StartDate: time.Now().Format("2006-01-02"),
		EndDate:   time.Now().AddDate(0, 0, 7).Format("2006-01-02"),
	}

	t.Run("their own client is reachable", func(t *testing.T) {
		created, err := service.CreateWeeklyPlan(ctx, mine, client, plan)
		require.NoError(t, err)
		require.NotNil(t, created)

		plans, err := service.GetWeeklyPlans(ctx, mine, client)
		require.NoError(t, err)
		assert.Len(t, plans, 1)
	})

	t.Run("somebody else's client is not", func(t *testing.T) {
		_, err := service.CreateWeeklyPlan(ctx, other, client, plan)
		assert.ErrorIs(t, err, apperrors.ErrForbidden)

		_, err = service.GetWeeklyPlans(ctx, other, client)
		assert.ErrorIs(t, err, apperrors.ErrForbidden)

		target := 70.0
		assert.ErrorIs(t, service.SetTargetWeight(ctx, other, client, &target), apperrors.ErrForbidden)

		_, err = service.GetClientDetail(ctx, other, client, time.Now().Format("2006-01-02"), 7)
		assert.ErrorIs(t, err, apperrors.ErrForbidden)
	})

	t.Run("an ended relationship stops being a key", func(t *testing.T) {
		_, err := db.ExecContext(ctx,
			`UPDATE curator_client_relationships SET status = 'inactive'
			 WHERE curator_id = $1 AND client_id = $2`, mine, client)
		require.NoError(t, err)

		_, err = service.GetWeeklyPlans(ctx, mine, client)
		assert.ErrorIs(t, err, apperrors.ErrForbidden,
			"a curator who no longer works with somebody must lose access to them")
	})
}
