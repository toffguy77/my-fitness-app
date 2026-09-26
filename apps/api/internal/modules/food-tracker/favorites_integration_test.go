//go:build integration

package foodtracker_test

import (
	"context"
	"strconv"
	"testing"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Избранное на подмене проверить нельзя: оба дефекта, из-за которых оно не
// работало, видит только настоящая база.
//
//  1. `INSERT` ссылался на колонку `added_at`, которой нет — она называется
//     `created_at`. sqlmock принял бы любой запрос.
//  2. `food_id` — UUID со ссылкой на `food_items`, а поиск отдаёт ещё и строки
//     таблицы `products` с числовыми идентификаторами. Для запроса «молоко» это
//     15 строк из 20, и первая из них — первая же в выдаче.
func favoritesFixtures(t *testing.T) (*foodtracker.Service, *database.DB, int64) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "favorites")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('fav@example.test', 'x', 'Едок', 'client')
		 RETURNING id`).Scan(&userID))

	return foodtracker.NewService(db, logger.New()), db, userID
}

// Продукт из food_items: обычный случай, идентификатор уже UUID.
func foodItem(t *testing.T, db *database.DB, name string) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
		 VALUES ($1, 'grains', 340, 13, 3, 66) RETURNING id::text`, name).Scan(&id))
	return id
}

// Продукт из products: идентификатор числовой, и в избранное его надо сначала
// перенести в food_items.
func productRow(t *testing.T, db *database.DB, id int, name string) string {
	t.Helper()
	ctx := context.Background()

	var categoryID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO categories (name, slug, type, source_url) VALUES ('Крупы', 'krupy', 'food', 'https://example.test/krupy') RETURNING id`).Scan(&categoryID))

	_, err := db.ExecContext(ctx,
		`INSERT INTO products (id, category_id, name, brand, calories, proteins, fats, carbs)
		 VALUES ($1, $2, $3, 'Ашан', 340, 13, 3, 66)`, id, categoryID, name)
	require.NoError(t, err)

	return strconv.Itoa(id)
}

func favoriteNames(t *testing.T, service *foodtracker.Service, userID int64) []string {
	t.Helper()
	resp, err := service.GetFavoriteFoods(context.Background(), userID, 50)
	require.NoError(t, err)
	names := make([]string, 0, len(resp.Foods))
	for _, food := range resp.Foods {
		names = append(names, food.Name)
	}
	return names
}

func TestFavoriteIsAddedAndVisible(t *testing.T) {
	service, db, userID := favoritesFixtures(t)
	id := foodItem(t, db, "Гречка")

	require.NoError(t, service.AddToFavorites(context.Background(), userID, id))

	assert.Equal(t, []string{"Гречка"}, favoriteNames(t, service, userID))
}

func TestFavoriteIsRemoved(t *testing.T) {
	service, db, userID := favoritesFixtures(t)
	ctx := context.Background()
	id := foodItem(t, db, "Гречка")
	require.NoError(t, service.AddToFavorites(ctx, userID, id))

	require.NoError(t, service.RemoveFromFavorites(ctx, userID, id))

	assert.Empty(t, favoriteNames(t, service, userID))
}

func TestAddingTwiceIsNotAnError(t *testing.T) {
	service, db, userID := favoritesFixtures(t)
	ctx := context.Background()
	id := foodItem(t, db, "Гречка")

	require.NoError(t, service.AddToFavorites(ctx, userID, id))
	require.NoError(t, service.AddToFavorites(ctx, userID, id))

	assert.Len(t, favoriteNames(t, service, userID), 1)
}

// То, из-за чего отметка отвечала 400 в браузере.
func TestProductFromSearchCanBeFavorited(t *testing.T) {
	service, db, userID := favoritesFixtures(t)
	ctx := context.Background()
	numericID := productRow(t, db, 10231, "Гречка Ашан")

	require.NoError(t, service.AddToFavorites(ctx, userID, numericID),
		"половину найденного поиском нельзя было отметить вовсе")

	assert.Equal(t, []string{"Гречка Ашан"}, favoriteNames(t, service, userID))
}

func TestProductFromSearchCanBeUnfavorited(t *testing.T) {
	service, db, userID := favoritesFixtures(t)
	ctx := context.Background()
	numericID := productRow(t, db, 10231, "Гречка Ашан")
	require.NoError(t, service.AddToFavorites(ctx, userID, numericID))

	require.NoError(t, service.RemoveFromFavorites(ctx, userID, numericID))

	assert.Empty(t, favoriteNames(t, service, userID))
}

// Перенос идемпотентен: один продукт — одна строка в food_items, сколько раз его
// ни отмечай.
func TestFavoritingAProductTwiceCopiesItOnce(t *testing.T) {
	service, db, userID := favoritesFixtures(t)
	ctx := context.Background()
	numericID := productRow(t, db, 10231, "Гречка Ашан")

	require.NoError(t, service.AddToFavorites(ctx, userID, numericID))
	require.NoError(t, service.RemoveFromFavorites(ctx, userID, numericID))
	require.NoError(t, service.AddToFavorites(ctx, userID, numericID))

	var copies int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM food_items WHERE name = 'Гречка Ашан'`).Scan(&copies))
	assert.Equal(t, 1, copies)
}

func TestUnknownFoodIsRefused(t *testing.T) {
	service, _, userID := favoritesFixtures(t)

	err := service.AddToFavorites(context.Background(), userID, "999999")

	assert.Error(t, err, "несуществующий продукт нельзя отметить")
}

// Избранное у каждого своё: таблица не имеет защиты на уровне базы, и запрос
// обязан ограничивать выборку самим спрашивающим.
func TestFavoritesAreNotShared(t *testing.T) {
	service, db, mine := favoritesFixtures(t)
	ctx := context.Background()

	var theirs int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('other@example.test', 'x', 'Чужой', 'client')
		 RETURNING id`).Scan(&theirs))

	id := foodItem(t, db, "Гречка")
	require.NoError(t, service.AddToFavorites(ctx, mine, id))

	assert.Empty(t, favoriteNames(t, service, theirs))
}
