package nutrition

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestService() *Service {
	cfg := &config.Config{
		Env:       "test",
		JWTSecret: "test-secret",
	}
	log := logger.New()
	return NewService(cfg, log)
}

func TestNewService(t *testing.T) {
	service := setupTestService()
	assert.NotNil(t, service)
	assert.NotNil(t, service.cfg)
	assert.NotNil(t, service.log)
}

func TestService_GetEntries(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	entries, err := service.GetEntries(ctx, "test-user-123")

	require.NoError(t, err)
	assert.NotNil(t, entries)
	assert.NotEmpty(t, entries)
	assert.Equal(t, "test-user-123", entries[0].UserID)
}

func TestService_CreateEntry(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	req := &CreateEntryRequest{
		Date:     "2026-01-26",
		Meal:     "breakfast",
		Food:     "Oatmeal",
		Calories: 150,
		Protein:  5,
		Carbs:    27,
		Fat:      3,
	}

	entry, err := service.CreateEntry(ctx, "test-user-123", req)

	require.NoError(t, err)
	assert.NotNil(t, entry)
	assert.Equal(t, "test-user-123", entry.UserID)
	assert.Equal(t, "2026-01-26", entry.Date)
	assert.Equal(t, "breakfast", entry.Meal)
	assert.Equal(t, "Oatmeal", entry.Food)
	assert.Equal(t, 150.0, entry.Calories)
	assert.Equal(t, 5.0, entry.Protein)
	assert.Equal(t, 27.0, entry.Carbs)
	assert.Equal(t, 3.0, entry.Fat)
}

func TestService_CreateEntry_WithZeroMacros(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	req := &CreateEntryRequest{
		Date:     "2026-01-26",
		Meal:     "snack",
		Food:     "Water",
		Calories: 0,
		Protein:  0,
		Carbs:    0,
		Fat:      0,
	}

	entry, err := service.CreateEntry(ctx, "test-user-123", req)

	require.NoError(t, err)
	assert.NotNil(t, entry)
	assert.Equal(t, 0.0, entry.Calories)
}

func TestService_CreateEntry_DifferentMeals(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	meals := []string{"breakfast", "lunch", "dinner", "snack"}

	for _, meal := range meals {
		t.Run(meal, func(t *testing.T) {
			req := &CreateEntryRequest{
				Date:     "2026-01-26",
				Meal:     meal,
				Food:     "Test Food",
				Calories: 100,
			}

			entry, err := service.CreateEntry(ctx, "test-user-123", req)
			require.NoError(t, err)
			assert.Equal(t, meal, entry.Meal)
		})
	}
}

func TestService_GetEntry(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	entry, err := service.GetEntry(ctx, "test-user-123", "entry-123")

	require.NoError(t, err)
	assert.NotNil(t, entry)
	assert.Equal(t, "entry-123", entry.ID)
	assert.Equal(t, "test-user-123", entry.UserID)
	assert.NotEmpty(t, entry.Food)
}

func TestService_UpdateEntry(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	req := &CreateEntryRequest{
		Date:     "2026-01-26",
		Meal:     "lunch",
		Food:     "Updated Food",
		Calories: 200,
		Protein:  10,
		Carbs:    30,
		Fat:      5,
	}

	entry, err := service.UpdateEntry(ctx, "test-user-123", "entry-123", req)

	require.NoError(t, err)
	assert.NotNil(t, entry)
	assert.Equal(t, "entry-123", entry.ID)
	assert.Equal(t, "Updated Food", entry.Food)
	assert.Equal(t, 200.0, entry.Calories)
}

func TestService_UpdateEntry_PartialUpdate(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	req := &CreateEntryRequest{
		Date:     "2026-01-26",
		Meal:     "dinner",
		Food:     "Partial Update",
		Calories: 300,
		// Protein, Carbs, Fat are zero values
	}

	entry, err := service.UpdateEntry(ctx, "test-user-123", "entry-123", req)

	require.NoError(t, err)
	assert.Equal(t, "Partial Update", entry.Food)
	assert.Equal(t, 300.0, entry.Calories)
}

func TestService_DeleteEntry(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	err := service.DeleteEntry(ctx, "test-user-123", "entry-123")

	require.NoError(t, err)
}

func TestService_DeleteEntry_DifferentIDs(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	entryIDs := []string{"entry-1", "entry-999", "abc-123-def"}

	for _, entryID := range entryIDs {
		t.Run(entryID, func(t *testing.T) {
			err := service.DeleteEntry(ctx, "test-user-123", entryID)
			require.NoError(t, err)
		})
	}
}

func TestService_CreateEntry_HighCalories(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	req := &CreateEntryRequest{
		Date:     "2026-01-26",
		Meal:     "dinner",
		Food:     "Large Pizza",
		Calories: 2500,
		Protein:  100,
		Carbs:    300,
		Fat:      100,
	}

	entry, err := service.CreateEntry(ctx, "test-user-123", req)

	require.NoError(t, err)
	assert.Equal(t, 2500.0, entry.Calories)
}

func TestService_CreateEntry_CyrillicFood(t *testing.T) {
	service := setupTestService()
	ctx := context.Background()

	req := &CreateEntryRequest{
		Date:     "2026-01-26",
		Meal:     "обед",
		Food:     "Борщ с хлебом",
		Calories: 350,
		Protein:  15,
		Carbs:    45,
		Fat:      12,
	}

	entry, err := service.CreateEntry(ctx, "test-user-123", req)

	require.NoError(t, err)
	assert.Equal(t, "Борщ с хлебом", entry.Food)
	assert.Equal(t, "обед", entry.Meal)
}
