//go:build integration

package foodtracker_test

import (
	"context"
	"errors"
	"testing"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Личный продукт сотрудника не должен стать ингредиентом рецепта для всех:
// SearchCatalogue не видит ни user_foods вызывающего, ни food_items с
// источником 'user', а EnsureCatalogueFood их не принимает.
func TestSearchCatalogueExcludesPersonalFoods(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "catalogue_search")
	ctx := context.Background()
	service := foodtracker.NewService(db, logger.New())

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('staff@example.test', 'x', 'Сотрудник', 'super_admin')
		 RETURNING id`).Scan(&userID))

	var personalFood, userSourced, shared string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO user_foods (user_id, name, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
		 VALUES ($1, 'Творог бабушкин', 150, 18, 5, 3) RETURNING id::text`, userID).Scan(&personalFood))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, source)
		 VALUES ('Творог домашний', 'custom', 150, 18, 5, 3, 'user') RETURNING id::text`).Scan(&userSourced))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, default_weight)
		 VALUES ('Творог 5%', 'dairy', 121, 17.2, 5, 1.8, 180) RETURNING id::text`).Scan(&shared))

	var categoryID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO categories (name, slug, type, source_url) VALUES ('Молочное', 'moloko', 'food', 'https://example.test/m') RETURNING id`).Scan(&categoryID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO products (id, category_id, name, calories, proteins, fats, carbs, default_weight)
		 VALUES (777, $1, 'Творог 9%', 159, 16, 9, 2, 200)`, categoryID)
	require.NoError(t, err)

	// Сначала убедимся, что SearchFoods личный продукт видит — иначе проверка
	// ниже ничего бы не доказывала.
	diary, err := service.SearchFoods(ctx, userID, "творог", 20, 0)
	require.NoError(t, err)
	var diaryIDs []string
	for _, f := range diary.Foods {
		diaryIDs = append(diaryIDs, f.ID)
	}
	require.Contains(t, diaryIDs, personalFood)

	found, err := service.SearchCatalogue(ctx, "творог", 20)
	require.NoError(t, err)
	var ids []string
	for _, f := range found {
		ids = append(ids, f.FoodID)
	}
	assert.Contains(t, ids, shared)
	assert.Contains(t, ids, "777")
	assert.NotContains(t, ids, personalFood)
	assert.NotContains(t, ids, userSourced)

	// Нормализация: products копируется в food_items под UUID вместе с весом штуки.
	food, err := service.EnsureCatalogueFood(ctx, "777")
	require.NoError(t, err)
	assert.Len(t, food.FoodID, 36)
	require.NotNil(t, food.DefaultWeight)
	assert.InDelta(t, 200, *food.DefaultWeight, 0.001)
	again, err := service.EnsureCatalogueFood(ctx, food.FoodID)
	require.NoError(t, err)
	assert.Equal(t, "Творог 9%", again.Name)
	require.NotNil(t, again.DefaultWeight)

	for _, id := range []string{personalFood, userSourced, "999999", "not-an-id"} {
		_, err := service.EnsureCatalogueFood(ctx, id)
		assert.True(t, errors.Is(err, apperrors.ErrValidation), "id %s must be refused, got %v", id, err)
	}
}
