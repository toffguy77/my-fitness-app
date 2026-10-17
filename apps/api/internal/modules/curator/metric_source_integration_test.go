//go:build integration

package curator_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
)

// Требование «У метрик дня есть источник» (daily-metric-source) для куратора:
// карточка клиента в списке и GET /curator/clients/:id отдают, откуда пришли
// вес, шаги и тренировка, — и null там, где значения нет.
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 -run Source ./internal/modules/curator/
func TestClientCardAndDetailCarryMetricSources(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "curator_source")
	ctx := context.Background()
	service := curator.NewService(db, logger.New(), nil)

	var curatorID, clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('source-curator@example.test', 'x', 'Куратор', 'coordinator') RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('source-client@example.test', 'x', 'Клиент', 'client') RETURNING id`).Scan(&clientID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1, $2, 'active')`,
		curatorID, clientID)
	require.NoError(t, err)

	today := time.Now().UTC().Format("2006-01-02")
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")

	// Вчера — вес руками; сегодня — вес и шаги из Здоровья, тренировка руками.
	_, err = db.ExecContext(ctx,
		`INSERT INTO daily_metrics (user_id, date, weight, weight_source) VALUES ($1, $2, 79.0, 'manual')`,
		clientID, yesterday)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO daily_metrics (user_id, date, weight, weight_source, steps, steps_source,
		                            workout_completed, workout_type, workout_duration, workout_source)
		 VALUES ($1, $2, 78.4, 'healthkit', 6412, 'healthkit', true, 'strength:40', 40, 'manual')`,
		clientID, today)
	require.NoError(t, err)

	cards, err := service.GetClients(ctx, curatorID)
	require.NoError(t, err)
	require.Len(t, cards, 1)
	require.NotNil(t, cards[0].LastWeightSource)
	assert.Equal(t, "healthkit", *cards[0].LastWeightSource, "последний вес — из Здоровья")

	detail, err := service.GetClientDetail(ctx, curatorID, clientID, "", 7)
	require.NoError(t, err)
	require.NotNil(t, detail.LastWeightSource)
	assert.Equal(t, "healthkit", *detail.LastWeightSource)

	days := map[string]curator.DayDetail{}
	for _, d := range detail.Days {
		days[d.Date] = d
	}

	day := days[today]
	require.NotNil(t, day.Weight)
	assert.InDelta(t, 78.4, *day.Weight, 0.001)
	assert.Equal(t, "healthkit", deref(day.StepsSource))
	assert.Equal(t, "healthkit", deref(day.WeightSource))
	assert.Equal(t, "manual", deref(day.WorkoutSource))

	past := days[yesterday]
	assert.Equal(t, "manual", deref(past.WeightSource))
	assert.Nil(t, past.StepsSource, "шагов нет — источник null")
	assert.Nil(t, past.WorkoutSource)

	history := map[string]string{}
	for _, p := range detail.WeightHistory {
		history[p.Date] = deref(p.Source)
	}
	assert.Equal(t, map[string]string{yesterday: "manual", today: "healthkit"}, history)

	// В JSON поля присутствуют и тогда, когда значения нет: клиенту нужен null.
	raw, err := json.Marshal(past)
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"steps_source":null`)
	assert.Contains(t, string(raw), `"workout_source":null`)
}

func deref(p *string) string {
	if p == nil {
		return "<nil>"
	}
	return *p
}
