//go:build integration

package curator_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
)

// Списки клиентов подставлялись в SQL как «($1,$2,...,$N)», собранные под длину
// списка. Текст запроса при этом менялся вместе с числом клиентов, а pgx
// кеширует подготовленные операторы по тексту и на каждое соединение: куратор с
// двенадцатью клиентами и куратор с тринадцатью занимали в кеше разные места,
// и LRU вытеснял то, что ещё пригодится.
//
// Этот тест смотрит на то же самое со стороны базы: сколько разных
// подготовленных операторов она держит после одних и тех же вызовов с разной
// длиной списка. Утверждение — «один», а не «мало»: оно либо верно, либо нет.
//
// Запускать:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/modules/curator/
func TestClientListQueriesHaveOneShapeWhateverTheCount(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "curator_shape")
	ctx := context.Background()

	// Подготовленные операторы живут в сеансе. Одно соединение — один сеанс,
	// иначе pg_prepared_statements покажет только часть.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	service := curator.NewService(db, logger.New(), nil)

	var curatorID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('shape-curator@example.test', 'x', 'Куратор', 'coordinator') RETURNING id`).Scan(&curatorID))

	addClient := func(n int) {
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role)
			 VALUES ($1, 'x', 'Клиент', 'client') RETURNING id`,
			fmt.Sprintf("shape-client-%d@example.test", n)).Scan(&id))
		_, err := db.ExecContext(ctx,
			`INSERT INTO curator_client_relationships (curator_id, client_id, status)
			 VALUES ($1, $2, 'active')`, curatorID, id)
		require.NoError(t, err)
	}

	// Один и тот же вызов на растущем списке: 1, 2, 3, 5, 8 клиентов. При сборке
	// плейсхолдеров это пять разных текстов на каждый запрос внутри.
	counts := []int{1, 2, 3, 5, 8}
	added := 0
	for _, want := range counts {
		for added < want {
			added++
			addClient(added)
		}
		_, err := service.GetClients(ctx, curatorID)
		require.NoError(t, err)
	}

	// Сколько разных подготовленных операторов база держит для каждого из
	// запросов, берущих список клиентов. Отбор по куску текста, который есть
	// только в нужном запросе.
	shapes := func(marker string) []string {
		rows, err := db.QueryContext(ctx,
			`SELECT statement FROM pg_prepared_statements WHERE statement LIKE '%' || $1 || '%'`,
			marker)
		require.NoError(t, err)
		defer func() { _ = rows.Close() }()

		var out []string
		for rows.Next() {
			var s string
			require.NoError(t, rows.Scan(&s))
			out = append(out, s)
		}
		require.NoError(t, rows.Err())
		return out
	}

	for _, probe := range []struct{ name, marker string }{
		{"целевой вес", "target_weight IS NOT NULL"},
		{"вода за сегодня", "FROM water_logs"},
		{"последняя активность", "MAX(date) FROM food_entries"},
	} {
		t.Run(probe.name, func(t *testing.T) {
			got := shapes(probe.marker)
			assert.Len(t, got, 1,
				"на %d разных длин списка база должна держать один оператор, а держит %d:\n%v",
				len(counts), len(got), got)
		})
	}
}
