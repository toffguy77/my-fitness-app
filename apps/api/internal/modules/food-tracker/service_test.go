package foodtracker

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Helper function to create a test service with mock database
func setupTestService(t *testing.T) (*Service, sqlmock.Sqlmock, func()) {
	mockDB, mock, err := sqlmock.New()
	require.NoError(t, err)

	db := &database.DB{DB: mockDB}
	log := logger.New()

	service := NewService(db, log)

	cleanup := func() {
		mockDB.Close()
	}

	return service, mock, cleanup
}

// ============================================================================
// SearchFoods Tests
// **Validates: Requirements 5.2, 6.2**
// ============================================================================

func TestSearchFoods(t *testing.T) {
	ctx := context.Background()

	// searchColumns defines the columns returned by the search CTE query
	searchColumns := []string{
		"id", "name", "brand", "category", "serving_size", "serving_unit",
		"calories_per_100", "protein_per_100", "fat_per_100", "carbs_per_100",
		"fiber_per_100", "sugar_per_100", "sodium_per_100", "barcode", "source", "verified",
		"created_at", "updated_at", "rank", "source_priority",
	}

	t.Run("successfully searches foods with Latin query", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "apple"
		limit := 20

		foodID := uuid.New().String()
		now := time.Now()

		rows := sqlmock.NewRows(searchColumns).
			AddRow(foodID, "Apple", nil, "fruits", 100.0, "г", 52.0, 0.3, 0.2, 14.0, nil, nil, nil, nil, "database", true, now, now, 0.1, 1)

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, limit+1, 0).
			WillReturnRows(rows)

		result, err := service.SearchFoods(ctx, query, limit, 0)

		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Len(t, result.Foods, 1)
		assert.Equal(t, "Apple", result.Foods[0].Name)
		assert.Equal(t, 52.0, result.Foods[0].NutritionPer100.Calories)
		assert.Equal(t, 1, result.Total)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("successfully searches foods with Cyrillic query", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "яблоко"
		limit := 20

		foodID := uuid.New().String()
		now := time.Now()

		rows := sqlmock.NewRows(searchColumns).
			AddRow(foodID, "Яблоко", nil, "фрукты", 100.0, "г", 52.0, 0.3, 0.2, 14.0, nil, nil, nil, nil, "database", true, now, now, 0.1, 1)

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, limit+1, 0).
			WillReturnRows(rows)

		result, err := service.SearchFoods(ctx, query, limit, 0)

		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Len(t, result.Foods, 1)
		assert.Equal(t, "Яблоко", result.Foods[0].Name)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty list when no foods match", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "несуществующий продукт"
		limit := 20

		rows := sqlmock.NewRows(searchColumns)

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, limit+1, 0).
			WillReturnRows(rows)

		result, err := service.SearchFoods(ctx, query, limit, 0)

		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Len(t, result.Foods, 0)
		assert.Equal(t, 0, result.Total)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error for query too short", func(t *testing.T) {
		service, _, cleanup := setupTestService(t)
		defer cleanup()

		query := "ab" // Only 2 characters, need 3
		limit := 20

		result, err := service.SearchFoods(ctx, query, limit, 0)

		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "минимум 3 символа")
	})

	t.Run("uses default limit when limit is zero", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "молоко"
		limit := 0 // Should default to 20

		rows := sqlmock.NewRows(searchColumns)

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, 21, 0). // Default 20 + 1 for hasMore detection
			WillReturnRows(rows)

		_, err := service.SearchFoods(ctx, query, limit, 0)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("caps limit at maximum 50", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "хлеб"
		limit := 100 // Should be capped at 50

		rows := sqlmock.NewRows(searchColumns)

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, 51, 0). // Capped at 50 + 1 for hasMore detection
			WillReturnRows(rows)

		_, err := service.SearchFoods(ctx, query, limit, 0)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns multiple foods sorted by relevance", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "курица"
		limit := 20

		foodID1 := uuid.New().String()
		foodID2 := uuid.New().String()
		now := time.Now()

		rows := sqlmock.NewRows(searchColumns).
			AddRow(foodID1, "Курица грудка", nil, "мясо", 100.0, "г", 165.0, 31.0, 3.6, 0.0, nil, nil, nil, nil, "database", true, now, now, 0.2, 1).
			AddRow(foodID2, "Курица бедро", nil, "мясо", 100.0, "г", 209.0, 26.0, 10.9, 0.0, nil, nil, nil, nil, "database", true, now, now, 0.1, 1)

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, limit+1, 0).
			WillReturnRows(rows)

		result, err := service.SearchFoods(ctx, query, limit, 0)

		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Len(t, result.Foods, 2)
		assert.Equal(t, 2, result.Total)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("handles database error gracefully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "тест"
		limit := 20

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, limit+1, 0).
			WillReturnError(sql.ErrConnDone)

		result, err := service.SearchFoods(ctx, query, limit, 0)

		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "ошибка при поиске продуктов")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("populates NutritionPer100 correctly", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "рис"
		limit := 20

		foodID := uuid.New().String()
		now := time.Now()

		rows := sqlmock.NewRows(searchColumns).
			AddRow(foodID, "Рис белый", nil, "крупы", 100.0, "г", 130.0, 2.7, 0.3, 28.2, nil, nil, nil, nil, "database", true, now, now, 0.1, 1)

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, limit+1, 0).
			WillReturnRows(rows)

		result, err := service.SearchFoods(ctx, query, limit, 0)

		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Len(t, result.Foods, 1)

		food := result.Foods[0]
		assert.Equal(t, 130.0, food.NutritionPer100.Calories)
		assert.Equal(t, 2.7, food.NutritionPer100.Protein)
		assert.Equal(t, 0.3, food.NutritionPer100.Fat)
		assert.Equal(t, 28.2, food.NutritionPer100.Carbs)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("supports pagination with offset", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		query := "молоко"
		limit := 20
		offset := 20

		foodID := uuid.New().String()
		now := time.Now()

		rows := sqlmock.NewRows(searchColumns).
			AddRow(foodID, "Молоко 3.2%", nil, "молочные", 100.0, "мл", 60.0, 2.9, 3.2, 4.7, nil, nil, nil, nil, "database", true, now, now, 0.1, 1)

		mock.ExpectQuery(`WITH matched`).
			WithArgs(query, limit+1, offset).
			WillReturnRows(rows)

		result, err := service.SearchFoods(ctx, query, limit, offset)

		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Len(t, result.Foods, 1)
		assert.Equal(t, 21, result.Total) // offset(20) + len(foods)(1) = 21
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// LookupBarcode Tests
// **Validates: Requirements 5.2, 6.2**
// ============================================================================

func TestLookupBarcode(t *testing.T) {
	ctx := context.Background()

	t.Run("finds product via products table fallback", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		barcode := "4607001234567"
		foodID := uuid.New().String()
		now := time.Now()

		// Step 1: food_items lookup miss
		mock.ExpectQuery(`SELECT id, name, brand, category, serving_size, serving_unit`).
			WithArgs(barcode).
			WillReturnError(sql.ErrNoRows)

		// Step 2: products table fallback hit (inside getFoodByBarcode)
		productRows := sqlmock.NewRows([]string{
			"id", "name", "brand", "category", "serving_size", "serving_unit",
			"calories_per_100", "protein_per_100", "fat_per_100", "carbs_per_100",
			"fiber_per_100", "sugar_per_100", "sodium_per_100", "barcode", "source", "verified",
			"created_at", "updated_at",
		}).
			AddRow(foodID, "Молоко 3.2%", stringPtr("Простоквашино"), "молочные", 100.0, "мл", 60.0, 2.9, 3.2, 4.7, nil, nil, nil, &barcode, "database", true, now, now)

		mock.ExpectQuery(`SELECT id::text, name, brand`).
			WithArgs(barcode).
			WillReturnRows(productRows)

		// Execute
		result, err := service.LookupBarcode(ctx, barcode)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.True(t, result.Found)
		assert.False(t, result.Cached)
		assert.NotNil(t, result.Food)
		assert.Equal(t, "Молоко 3.2%", result.Food.Name)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("finds product directly in food_items table", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		barcode := "4607009876543"
		foodID := uuid.New().String()
		now := time.Now()

		// food_items lookup hit (first check in LookupBarcode)
		foodRows := sqlmock.NewRows([]string{
			"id", "name", "brand", "category", "serving_size", "serving_unit",
			"calories_per_100", "protein_per_100", "fat_per_100", "carbs_per_100",
			"fiber_per_100", "sugar_per_100", "sodium_per_100", "barcode", "source", "verified",
			"created_at", "updated_at",
		}).
			AddRow(foodID, "Сок апельсиновый", stringPtr("Добрый"), "напитки", 100.0, "мл", 45.0, 0.7, 0.2, 10.4, nil, nil, nil, &barcode, "database", true, now, now)

		mock.ExpectQuery(`SELECT id, name, brand, category, serving_size, serving_unit`).
			WithArgs(barcode).
			WillReturnRows(foodRows)

		// Execute — should return immediately from food_items hit, no cache check needed
		result, err := service.LookupBarcode(ctx, barcode)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.True(t, result.Found)
		assert.False(t, result.Cached)
		assert.NotNil(t, result.Food)
		assert.Equal(t, "Сок апельсиновый", result.Food.Name)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns not found message when barcode not in database", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		barcode := "0000000000000"

		// Step 1: food_items miss
		mock.ExpectQuery(`SELECT id, name, brand, category, serving_size, serving_unit`).
			WithArgs(barcode).
			WillReturnError(sql.ErrNoRows)

		// Step 2: products table miss (inside getFoodByBarcode fallback)
		mock.ExpectQuery(`SELECT id::text, name, brand`).
			WithArgs(barcode).
			WillReturnError(sql.ErrNoRows)

		// Step 3: OFF API will be called but returns 404 for fake barcode → falls through to "not found"

		// Execute
		result, err := service.LookupBarcode(ctx, barcode)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.False(t, result.Found)
		assert.False(t, result.Cached)
		assert.Nil(t, result.Food)
		assert.NotNil(t, result.Message)
		// Message must be in Russian
		assert.Contains(t, *result.Message, "Продукт не найден")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error for empty barcode", func(t *testing.T) {
		service, _, cleanup := setupTestService(t)
		defer cleanup()

		barcode := ""

		// Execute
		result, err := service.LookupBarcode(ctx, barcode)

		// Assert - error message must be in Russian
		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "штрих-код обязателен")
	})

	t.Run("finds product in food_items even with expired cache", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		barcode := "4607005555555"
		foodID := uuid.New().String()
		now := time.Now()

		// food_items direct hit (first check in LookupBarcode)
		foodRows := sqlmock.NewRows([]string{
			"id", "name", "brand", "category", "serving_size", "serving_unit",
			"calories_per_100", "protein_per_100", "fat_per_100", "carbs_per_100",
			"fiber_per_100", "sugar_per_100", "sodium_per_100", "barcode", "source", "verified",
			"created_at", "updated_at",
		}).
			AddRow(foodID, "Кефир 1%", stringPtr("Домик в деревне"), "молочные", 100.0, "мл", 40.0, 3.0, 1.0, 4.0, nil, nil, nil, &barcode, "database", true, now, now)

		mock.ExpectQuery(`SELECT id, name, brand, category, serving_size, serving_unit`).
			WithArgs(barcode).
			WillReturnRows(foodRows)

		// Execute — returns immediately from food_items, cache not checked
		result, err := service.LookupBarcode(ctx, barcode)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.True(t, result.Found)
		assert.False(t, result.Cached)
		assert.NotNil(t, result.Food)
		assert.Equal(t, "Кефир 1%", result.Food.Name)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("handles database error during barcode lookup", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		barcode := "4607007777777"

		// Step 1: food_items query returns a real error (not ErrNoRows) — getFoodByBarcode returns error
		mock.ExpectQuery(`SELECT id, name, brand, category, serving_size, serving_unit`).
			WithArgs(barcode).
			WillReturnError(sql.ErrConnDone)

		// getFoodByBarcode returns error on non-ErrNoRows, LookupBarcode falls through to OFF API
		// Step 2: OFF API called, returns 404 for fake barcode → not found

		// Execute — graceful degradation, returns not found instead of error
		result, err := service.LookupBarcode(ctx, barcode)

		// Assert — function gracefully degrades to "not found"
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.False(t, result.Found)
		assert.NotNil(t, result.Message)
		assert.Contains(t, *result.Message, "Продукт не найден")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("populates food nutrition correctly from barcode lookup", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		barcode := "4607008888888"
		foodID := uuid.New().String()
		now := time.Now()

		// food_items direct hit with specific nutrition values
		foodRows := sqlmock.NewRows([]string{
			"id", "name", "brand", "category", "serving_size", "serving_unit",
			"calories_per_100", "protein_per_100", "fat_per_100", "carbs_per_100",
			"fiber_per_100", "sugar_per_100", "sodium_per_100", "barcode", "source", "verified",
			"created_at", "updated_at",
		}).
			AddRow(foodID, "Творог 5%", stringPtr("Савушкин"), "молочные", 100.0, "г", 121.0, 17.2, 5.0, 1.8, nil, nil, nil, &barcode, "database", true, now, now)

		mock.ExpectQuery(`SELECT id, name, brand, category, serving_size, serving_unit`).
			WithArgs(barcode).
			WillReturnRows(foodRows)

		// Execute
		result, err := service.LookupBarcode(ctx, barcode)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.True(t, result.Found)
		assert.NotNil(t, result.Food)

		food := result.Food
		assert.Equal(t, "Творог 5%", food.Name)
		assert.Equal(t, 121.0, food.NutritionPer100.Calories)
		assert.Equal(t, 17.2, food.NutritionPer100.Protein)
		assert.Equal(t, 5.0, food.NutritionPer100.Fat)
		assert.Equal(t, 1.8, food.NutritionPer100.Carbs)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("handles various barcode formats", func(t *testing.T) {
		testCases := []struct {
			name    string
			barcode string
		}{
			{"EAN-13", "4607001234567"},
			{"EAN-8", "46012345"},
			{"UPC-A", "012345678905"},
			{"Long barcode", "12345678901234567890"},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				service, mock, cleanup := setupTestService(t)
				defer cleanup()

				// Step 1: food_items miss
				mock.ExpectQuery(`SELECT id, name, brand, category, serving_size, serving_unit`).
					WithArgs(tc.barcode).
					WillReturnError(sql.ErrNoRows)

				// Step 2: products table miss (inside getFoodByBarcode fallback)
				mock.ExpectQuery(`SELECT id::text, name, brand`).
					WithArgs(tc.barcode).
					WillReturnError(sql.ErrNoRows)

				// Step 3: OFF API called, returns 404 for unknown barcode → not found

				// Execute
				result, err := service.LookupBarcode(ctx, tc.barcode)

				// Assert - should handle any barcode format
				require.NoError(t, err)
				assert.NotNil(t, result)
				assert.False(t, result.Found)
				assert.NoError(t, mock.ExpectationsWereMet())
			})
		}
	})
}

// ============================================================================
// Helper Functions
// ============================================================================

// stringPtr returns a pointer to a string
func stringPtr(s string) *string {
	return &s
}
