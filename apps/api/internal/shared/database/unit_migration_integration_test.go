//go:build integration

package database_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/migrations"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The units were stored as Russian words and shown to people as they were, so
// a second language would have read "г" in the middle of English. Migration 061
// turns them into codes. What a person reads must not change, and anything that
// is not one of those four units must survive untouched.
func TestUnitsBecomeCodesWithoutLosingAnything(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('units@example.test','x','U','client')
		 RETURNING id`).Scan(&userID))

	// Rows as they looked before the migration: the four units, plus something
	// imported that is none of them.
	for _, unit := range []string{"г", "мл", "шт", "порция", "cup"} {
		_, err := db.ExecContext(ctx,
			`INSERT INTO food_items (name, category, serving_unit, calories_per_100)
			 VALUES ($1, 'imported', $2, 100)`, "Еда "+unit, unit)
		require.NoError(t, err)
	}
	_, err := db.ExecContext(ctx,
		`INSERT INTO user_foods (user_id, name, serving_unit, calories_per_100)
		 VALUES ($1, 'Своё', 'мл', 50)`, userID)
	require.NoError(t, err)

	_, err = db.ExecContext(ctx,
		`INSERT INTO nutrient_recommendations (name, category, unit, daily_target)
		 VALUES ('Витамин D', 'vitamins', 'мкг', 10)`)
	require.NoError(t, err)

	// Reconstructing the state before 061: the migrations have all run, so the
	// constraint already names the codes. Dropping it is what the pre-migration
	// database looked like, and it is what lets an old value be written here.
	_, err = db.ExecContext(ctx,
		`ALTER TABLE user_custom_recommendations DROP CONSTRAINT user_custom_recommendations_unit_check`)
	require.NoError(t, err)

	// This one is bounded by a CHECK listing the Russian words, so the
	// migration has to replace the constraint as well as the values.
	_, err = db.ExecContext(ctx,
		`INSERT INTO user_custom_recommendations (user_id, name, unit, daily_target)
		 VALUES ($1, 'Омега-3', 'МЕ', 400)`, userID)
	require.NoError(t, err)

	runMigrationFile(t, db, "061_neutral_unit_codes_up.sql")

	items := unitCounts(t, db, "food_items", "serving_unit")
	assert.Equal(t, 1, items["g"])
	assert.Equal(t, 1, items["ml"])
	assert.Equal(t, 1, items["pcs"])
	assert.Equal(t, 1, items["serving"])
	assert.Equal(t, 1, items["cup"], "a unit nobody planned for must survive untouched")
	for _, gone := range []string{"г", "мл", "шт", "порция"} {
		assert.NotContains(t, items, gone)
	}

	assert.Equal(t, map[string]int{"ml": 1}, unitCounts(t, db, "user_foods", "serving_unit"))
	assert.Contains(t, unitCounts(t, db, "nutrient_recommendations", "unit"), "mcg")
	assert.Equal(t, map[string]int{"IU": 1}, unitCounts(t, db, "user_custom_recommendations", "unit"))

	// The constraint moved with the values: the new codes are allowed and the
	// old words are not, so nothing can write a Russian word back in.
	_, err = db.ExecContext(ctx,
		`INSERT INTO user_custom_recommendations (user_id, name, unit, daily_target)
		 VALUES ($1, 'Магний', 'mg', 300)`, userID)
	assert.NoError(t, err, "a code must be accepted")
	_, err = db.ExecContext(ctx,
		`INSERT INTO user_custom_recommendations (user_id, name, unit, daily_target)
		 VALUES ($1, 'Кальций', 'мг', 1000)`, userID)
	assert.Error(t, err, "the old word must no longer be accepted")

	// A row written afterwards without naming a unit takes the new default,
	// rather than reintroducing the Russian word one row at a time.
	_, err = db.ExecContext(ctx,
		`INSERT INTO user_foods (user_id, name, calories_per_100) VALUES ($1, 'Без единицы', 10)`, userID)
	require.NoError(t, err)
	var defaulted string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT serving_unit FROM user_foods WHERE name = 'Без единицы'`).Scan(&defaulted))
	assert.Equal(t, "g", defaulted)
}

// Rolling back has to be as complete as rolling forward: half-converted is
// worse than either state.
func TestUnitCodesRollBack(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	_, err := db.ExecContext(ctx,
		`INSERT INTO food_items (name, category, serving_unit, calories_per_100)
		 VALUES ('Гречка', 'grains', 'g', 100), ('Молоко', 'dairy', 'ml', 60), ('Импорт', 'x', 'cup', 5)`)
	require.NoError(t, err)

	runMigrationFile(t, db, "061_neutral_unit_codes_down.sql")

	rows, err := db.QueryContext(ctx, `SELECT name, serving_unit FROM food_items ORDER BY name`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	got := map[string]string{}
	for rows.Next() {
		var name, unit string
		require.NoError(t, rows.Scan(&name, &unit))
		got[name] = unit
	}
	require.NoError(t, rows.Err())

	assert.Equal(t, "г", got["Гречка"])
	assert.Equal(t, "мл", got["Молоко"])
	assert.Equal(t, "cup", got["Импорт"])
}

// runMigrationFile executes one migration's SQL against this schema. The file
// is read from the embedded set, so the test runs exactly what ships.
func runMigrationFile(t *testing.T, db *database.DB, name string) {
	t.Helper()
	body, err := migrations.FS.ReadFile(name)
	require.NoError(t, err)
	_, err = db.ExecContext(context.Background(), string(body))
	require.NoError(t, err, "%s failed to apply", name)
}

func unitCounts(t *testing.T, db *database.DB, table, column string) map[string]int {
	t.Helper()
	rows, err := db.QueryContext(context.Background(),
		fmt.Sprintf("SELECT %s, count(*) FROM %s GROUP BY 1", column, table))
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	out := map[string]int{}
	for rows.Next() {
		var unit string
		var n int
		require.NoError(t, rows.Scan(&unit, &n))
		out[unit] = n
	}
	require.NoError(t, rows.Err())
	return out
}

// The workout column holds codes, durations and whatever somebody typed
// themselves, all in one comma-separated string. Migration 062 must convert the
// eight known names and leave the rest of it exactly as it was.
func TestWorkoutTypesBecomeCodes(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('workouts@example.test','x','W','client')
		 RETURNING id`).Scan(&userID))

	cases := []struct {
		day    string
		stored string
		want   string
	}{
		{"2026-01-01", "Силовая", "strength"},
		{"2026-01-02", "Силовая:45,Кардио:30", "strength:45,cardio:30"},
		{"2026-01-03", "Бег, Растяжка", "running,stretching"},
		// What somebody typed for themselves is not a code and must survive.
		{"2026-01-04", "Танцы:60", "Танцы:60"},
		{"2026-01-05", "Кардио:20,Танцы", "cardio:20,Танцы"},
		{"2026-01-06", "HIIT", "hiit"},
	}
	for _, c := range cases {
		_, err := db.ExecContext(ctx,
			`INSERT INTO daily_metrics (user_id, date, workout_completed, workout_type)
			 VALUES ($1, $2::date, true, $3)`, userID, c.day, c.stored)
		require.NoError(t, err, "inserting %q", c.stored)
	}

	runMigrationFile(t, db, "062_neutral_workout_codes_up.sql")

	for _, c := range cases {
		var got string
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT workout_type FROM daily_metrics WHERE user_id = $1 AND date = $2::date`,
			userID, c.day).Scan(&got))
		assert.Equal(t, c.want, got, "for %q", c.stored)
	}
}

func TestWorkoutCodesRollBack(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('back@example.test','x','B','client')
		 RETURNING id`).Scan(&userID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO daily_metrics (user_id, date, workout_completed, workout_type)
		 VALUES ($1, '2026-02-01'::date, true, 'strength:45,Танцы')`, userID)
	require.NoError(t, err)

	runMigrationFile(t, db, "062_neutral_workout_codes_down.sql")

	var got string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT workout_type FROM daily_metrics WHERE user_id = $1`, userID).Scan(&got))
	assert.Equal(t, "Силовая:45,Танцы", got)
}

// A day with no workout must not be touched: rebuilding an empty string into
// an empty list would write "" where NULL belongs.
func TestWorkoutMigrationLeavesEmptyDaysAlone(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('empty@example.test','x','E','client')
		 RETURNING id`).Scan(&userID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO daily_metrics (user_id, date, workout_completed, workout_type)
		 VALUES ($1, '2026-03-01'::date, false, NULL), ($1, '2026-03-02'::date, false, '')`, userID)
	require.NoError(t, err)

	runMigrationFile(t, db, "062_neutral_workout_codes_up.sql")

	var nullCount, emptyCount int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM daily_metrics WHERE user_id = $1 AND workout_type IS NULL`, userID).Scan(&nullCount))
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM daily_metrics WHERE user_id = $1 AND workout_type = ''`, userID).Scan(&emptyCount))
	assert.Equal(t, 1, nullCount)
	assert.Equal(t, 1, emptyCount)
}
