package curator

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The weekly job files metrics under the week that has finished, not the one in
// progress: a snapshot of a partial week would be wrong and would keep changing.
func TestLastCompletedWeekStart(t *testing.T) {
	cases := map[string]struct {
		now  time.Time
		want time.Time
	}{
		"monday morning": {
			now:  time.Date(2026, 3, 2, 4, 0, 0, 0, time.UTC),  // Monday
			want: time.Date(2026, 2, 23, 0, 0, 0, 0, time.UTC), // previous Monday
		},
		"midweek": {
			now:  time.Date(2026, 3, 4, 12, 0, 0, 0, time.UTC), // Wednesday
			want: time.Date(2026, 2, 23, 0, 0, 0, 0, time.UTC),
		},
		"sunday night": {
			now:  time.Date(2026, 3, 8, 23, 59, 0, 0, time.UTC), // Sunday
			want: time.Date(2026, 2, 23, 0, 0, 0, 0, time.UTC),
		},
	}

	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			assert.Equal(t, c.want, lastCompletedWeekStart(c.now))
		})
	}
}

func TestActiveCuratorIDs(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT DISTINCT curator_id").
		WillReturnRows(sqlmock.NewRows([]string{"curator_id"}).AddRow(int64(1)).AddRow(int64(5)))

	ids, err := service.activeCuratorIDs(context.Background())

	require.NoError(t, err)
	assert.Equal(t, []int64{1, 5}, ids)
}

// One curator's failure must not cost the others their snapshot: the collector
// runs once a day and a missed day cannot be recovered.
func TestCollectAllDailySnapshots_ContinuesAfterOneFailure(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT DISTINCT curator_id").
		WillReturnRows(sqlmock.NewRows([]string{"curator_id"}).AddRow(int64(1)).AddRow(int64(2)))
	// First curator: analytics lookup fails.
	mock.ExpectQuery("SELECT").WillReturnError(errors.New("boom"))

	collected, err := service.CollectAllDailySnapshots(context.Background())

	// The loop must not abort on the first error.
	require.NoError(t, err)
	assert.Less(t, collected, 2)
}

func TestCollectAllDailySnapshots_ReportsListingFailure(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("SELECT DISTINCT curator_id").WillReturnError(errors.New("db down"))

	_, err := service.CollectAllDailySnapshots(context.Background())

	require.Error(t, err)
	assert.Contains(t, err.Error(), "list curators")
}

// With no clients there is nothing to measure, and dividing by zero clients
// must not happen.
func TestWeeklyMetrics_NoClients(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectQuery("curator_client_relationships").
		WillReturnRows(sqlmock.NewRows([]string{"client_id"}))

	weekStart := time.Date(2026, 2, 23, 0, 0, 0, 0, time.UTC)
	m, err := service.weeklyMetricsFor(context.Background(), 1, weekStart, weekStart.AddDate(0, 0, 7))

	require.NoError(t, err)
	assert.Zero(t, m.ClientsTotal)
	assert.Zero(t, m.AvgClientStreak)
	assert.Zero(t, m.ClientsOnTrack)
}
