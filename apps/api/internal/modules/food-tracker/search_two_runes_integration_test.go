//go:build integration

package foodtracker_test

import (
	"context"
	"testing"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/require"
)

// «Два символа» (`ios-food-logging`): «гр» находит гречку. Морфология FTS
// двухбуквенный запрос не разбирает — его находят ILIKE-ветки по названию,
// и без них снижение порога с 3 до 2 дало бы пустую выдачу вместо 400.
func TestSearchFindsByTwoLetters(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "search_two_runes")
	ctx := context.Background()
	service := foodtracker.NewService(db, logger.New())

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('client@example.test', 'x', 'Клиент', 'client')
		 RETURNING id`).Scan(&userID))
	var categoryID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO categories (name, slug, type, source_url) VALUES ('Крупы', 'krupy', 'food', 'https://example.test/k') RETURNING id`).Scan(&categoryID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO products (id, category_id, name, calories, proteins, fats, carbs, default_weight)
		 VALUES (778, $1, 'Гречка отварная', 110, 4, 1, 21, 150)`, categoryID)
	require.NoError(t, err)

	result, err := service.SearchFoods(ctx, userID, "гр", 20, 0)
	require.NoError(t, err)
	var names []string
	for _, food := range result.Foods {
		names = append(names, food.Name)
	}
	require.Contains(t, names, "Гречка отварная")
}
