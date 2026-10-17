//go:build integration

package foodtracker_test

import (
	"context"
	"testing"
	"time"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// water-decrement на настоящей базе: счётчик меняет UPSERT, и «не ниже нуля»
// держит он, а не обработчик.
func waterFixture(t *testing.T) (*foodtracker.Service, int64) {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, "water")
	var userID int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role) VALUES ('water@example.test', 'x', 'Вода', 'client')
		 RETURNING id`).Scan(&userID))
	return foodtracker.NewService(db, logger.New()), userID
}

func TestWaterDecrementScenarios(t *testing.T) {
	ctx := context.Background()
	day := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)

	t.Run("убрать стакан: 5 → 4", func(t *testing.T) {
		service, userID := waterFixture(t)
		_, err := service.AddWater(ctx, userID, day, 5)
		require.NoError(t, err)

		log, err := service.AddWater(ctx, userID, day, -1)
		require.NoError(t, err)
		assert.Equal(t, 4, log.Glasses)
	})

	t.Run("нечего убирать: записи нет — 0", func(t *testing.T) {
		service, userID := waterFixture(t)
		log, err := service.AddWater(ctx, userID, day, -1)
		require.NoError(t, err)
		assert.Equal(t, 0, log.Glasses)
	})

	t.Run("нечего убирать: было 0 — осталось 0", func(t *testing.T) {
		service, userID := waterFixture(t)
		_, err := service.AddWater(ctx, userID, day, 1)
		require.NoError(t, err)
		_, err = service.AddWater(ctx, userID, day, -1)
		require.NoError(t, err)

		log, err := service.AddWater(ctx, userID, day, -1)
		require.NoError(t, err)
		assert.Equal(t, 0, log.Glasses)
		got, err := service.GetWaterIntake(ctx, userID, day)
		require.NoError(t, err)
		assert.Equal(t, 0, got.Glasses)
	})

	t.Run("запрос веба без поля прибавляет один", func(t *testing.T) {
		service, userID := waterFixture(t)
		_, err := service.AddWater(ctx, userID, day, 2)
		require.NoError(t, err)

		log, err := service.AddWater(ctx, userID, day, 0)
		require.NoError(t, err)
		assert.Equal(t, 3, log.Glasses)
	})
}
