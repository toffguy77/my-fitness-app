//go:build integration

package foodtracker_test

import (
	"context"
	"testing"
	"time"

	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func diaryFixtures(t *testing.T) (*foodtracker.Service, *database.DB, int64, int64, string) {
	t.Helper()

	db := testsupport.SchemaWithMigrations(t, "diary")
	ctx := context.Background()

	var mine, theirs int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('mine@example.test', 'x', 'Мой', 'client')
		 RETURNING id`).Scan(&mine))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('theirs@example.test', 'x', 'Чужой', 'client')
		 RETURNING id`).Scan(&theirs))

	var foodID string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
		 VALUES ('Гречка', 'grains', 100, 10, 2, 20) RETURNING id::text`).Scan(&foodID))

	return foodtracker.NewService(db, logger.New()), db, mine, theirs, foodID
}

func entry(t *testing.T, service *foodtracker.Service, userID int64, foodID, date string, grams float64) {
	t.Helper()
	_, err := service.CreateEntry(context.Background(), userID, &foodtracker.CreateEntryRequest{
		FoodID:        foodID,
		MealType:      foodtracker.MealBreakfast,
		PortionType:   foodtracker.PortionGrams,
		PortionAmount: grams,
		Time:          "08:30",
		Date:          date,
	})
	require.NoError(t, err)
}

// The diary's arithmetic is the product: a portion is scaled from the per-100g
// figures and the day is the sum of its entries. Against a mock this proves
// nothing — the numbers come back from the mock.
func TestDailyTotalsAddUpTheDaysEntries(t *testing.T) {
	service, _, mine, _, foodID := diaryFixtures(t)
	ctx := context.Background()
	today := time.Now().Format("2006-01-02")

	entry(t, service, mine, foodID, today, 150)
	entry(t, service, mine, foodID, today, 50)

	totals, err := service.CalculateDailyTotals(ctx, mine, time.Now())
	require.NoError(t, err)

	// 200 g of a food with 100 kcal per 100 g.
	assert.InDelta(t, 200, totals.Calories, 0.01)
	assert.InDelta(t, 20, totals.Protein, 0.01)
	assert.InDelta(t, 4, totals.Fat, 0.01)
	assert.InDelta(t, 40, totals.Carbs, 0.01)
}

// Every query scopes by the caller: row-level security was switched off by
// migration 015, so the scoping is the only thing standing between two people's
// food diaries.
func TestTheDiaryShowsOnlyItsOwnersEntries(t *testing.T) {
	service, _, mine, theirs, foodID := diaryFixtures(t)
	ctx := context.Background()
	today := time.Now().Format("2006-01-02")

	entry(t, service, mine, foodID, today, 100)

	theirTotals, err := service.CalculateDailyTotals(ctx, theirs, time.Now())
	require.NoError(t, err)
	assert.Zero(t, theirTotals.Calories, "another account's entry must not count towards this one")

	theirDay, err := service.GetEntriesByDate(ctx, theirs, time.Now())
	require.NoError(t, err)
	for meal, entries := range theirDay.Entries {
		assert.Empty(t, entries, "meal %s leaked an entry belonging to somebody else", meal)
	}
}

// A day is a day in the person's own calendar: an entry recorded yesterday must
// not appear in today's total.
func TestEntriesAreCountedOnTheirOwnDay(t *testing.T) {
	service, _, mine, _, foodID := diaryFixtures(t)
	ctx := context.Background()

	yesterday := time.Now().AddDate(0, 0, -1)
	entry(t, service, mine, foodID, yesterday.Format("2006-01-02"), 100)

	today, err := service.CalculateDailyTotals(ctx, mine, time.Now())
	require.NoError(t, err)
	assert.Zero(t, today.Calories)

	past, err := service.CalculateDailyTotals(ctx, mine, yesterday)
	require.NoError(t, err)
	assert.InDelta(t, 100, past.Calories, 0.01)
}
