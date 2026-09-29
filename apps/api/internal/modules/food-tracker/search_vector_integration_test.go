//go:build integration

package foodtracker_test

import (
	"context"
	"strings"
	"testing"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Поиск по food_items читает хранимую колонку search_vector (миграция 087), а
// не вычисляет выражение на каждую строку.
//
// Здесь проверяется не скорость — на пустой базе мерить нечего, числа сняты
// отдельно на трёх миллионах строк и записаны в шапке миграции. Здесь
// проверяются два условия, при которых те числа вообще имеют силу: что выдача
// не изменилась и что запрос по-прежнему попадает в индекс.
//
// Запускать:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/modules/food-tracker/

func searchFixtures(t *testing.T) (*foodtracker.Service, *database.DB, int64) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "search_vector")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role)
		 VALUES ('search@example.test', 'x', 'Ищущий', 'client') RETURNING id`).Scan(&userID))

	for _, f := range []struct{ name, brand string }{
		{"Творог обезжиренный", "Простоквашино"},
		{"Творог зернёный", "Савушкин"},
		{"Молоко цельное", "Домик в деревне"},
		{"Хлеб ржаной", "Коломенское"},
	} {
		_, err := db.ExecContext(ctx,
			`INSERT INTO food_items (name, brand, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
			 VALUES ($1, $2, 'dairy', 100, 10, 5, 3)`, f.name, f.brand)
		require.NoError(t, err)
	}

	return foodtracker.NewService(db, logger.New()), db, userID
}

// Колонка хранит ровно то выражение, что стояло в запросе, поэтому выдача
// обязана совпасть — включая записи, найденные по марке, а не по названию.
func TestSearchFindsTheSameItemsThroughTheStoredVector(t *testing.T) {
	service, _, userID := searchFixtures(t)
	ctx := context.Background()

	t.Run("по названию", func(t *testing.T) {
		res, err := service.SearchFoods(ctx, userID, "творог", 20, 0)
		require.NoError(t, err)

		names := make([]string, 0, len(res.Foods))
		for _, f := range res.Foods {
			names = append(names, f.Name)
		}
		assert.ElementsMatch(t, []string{"Творог обезжиренный", "Творог зернёный"}, names)
	})

	t.Run("по марке", func(t *testing.T) {
		res, err := service.SearchFoods(ctx, userID, "простоквашино", 20, 0)
		require.NoError(t, err)

		require.Len(t, res.Foods, 1, "марка входит в тот же вектор, что и название")
		assert.Equal(t, "Творог обезжиренный", res.Foods[0].Name)
	})

	t.Run("чего нет — того нет", func(t *testing.T) {
		res, err := service.SearchFoods(ctx, userID, "ананас", 20, 0)
		require.NoError(t, err)
		assert.Empty(t, res.Foods)
	})
}

// Если запрос вернуть к вычислению выражения, индекса под него больше нет:
// миграция 087 сняла прежний, и поиск молча уедет в последовательное чтение
// трёх миллионов строк. Выдача при этом не изменится, и ни один тест выше
// этого не заметит — поэтому плану нужен отдельный.
func TestSearchOnFoodItemsUsesTheIndex(t *testing.T) {
	_, db, _ := searchFixtures(t)
	ctx := context.Background()

	// Планировщик выберет последовательное чтение на крошечной таблице, что
	// бы мы ни написали. Запрет говорит ему, что нас интересует не самый
	// быстрый план, а наличие годного.
	//
	// В транзакции, потому что SET LOCAL живёт до её конца: вне транзакции
	// каждый оператор сам себе транзакция, и запрет пропадает раньше, чем
	// до него дойдёт EXPLAIN.
	tx, err := db.BeginTx(ctx, nil)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback() }()

	_, err = tx.ExecContext(ctx, `SET LOCAL enable_seqscan = off`)
	require.NoError(t, err)

	rows, err := tx.QueryContext(ctx, `
		EXPLAIN
		SELECT id, ts_rank(search_vector, plainto_tsquery('russian', $1)) AS rank
		FROM food_items
		WHERE search_vector @@ plainto_tsquery('russian', $1)
		ORDER BY rank DESC
		LIMIT 200`, "творог")
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	var plan strings.Builder
	for rows.Next() {
		var line string
		require.NoError(t, rows.Scan(&line))
		plan.WriteString(line)
		plan.WriteString("\n")
	}
	require.NoError(t, rows.Err())

	assert.Contains(t, plan.String(), "idx_food_items_search",
		"поиск по food_items должен идти через индекс по search_vector, а план такой:\n%s",
		plan.String())
}
