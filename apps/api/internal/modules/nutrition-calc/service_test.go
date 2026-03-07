package nutritioncalc

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestService(t *testing.T) (*Service, sqlmock.Sqlmock, func()) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	log := logger.New()
	wrappedDB := &database.DB{DB: db}
	service := NewService(wrappedDB, log)

	return service, mock, func() { db.Close() }
}

func TestGetTargetsForDate(t *testing.T) {
	t.Run("returns stored targets", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		now := time.Now()
		mock.ExpectQuery("SELECT id, user_id, date").
			WithArgs(int64(1), "2026-03-06").
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "user_id", "date", "calories", "protein", "fat", "carbs",
				"bmr", "tdee", "workout_bonus", "weight_used", "source", "created_at",
			}).AddRow(
				1, 1, "2026-03-06", 2000.0, 120.0, 55.0, 250.0,
				1600.0, 2200.0, 0.0, 70.0, "calculated", now,
			))

		record, err := service.GetTargetsForDate(context.Background(), 1, "2026-03-06")
		require.NoError(t, err)
		require.NotNil(t, record)
		assert.Equal(t, 2000.0, record.Calories)
		assert.Equal(t, 120.0, record.Protein)
		assert.Equal(t, 55.0, record.Fat)
		assert.Equal(t, 250.0, record.Carbs)
		assert.Equal(t, "calculated", record.Source)
	})

	t.Run("returns nil when no targets exist", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT id, user_id, date").
			WithArgs(int64(1), "2026-03-06").
			WillReturnError(sql.ErrNoRows)

		record, err := service.GetTargetsForDate(context.Background(), 1, "2026-03-06")
		require.NoError(t, err)
		assert.Nil(t, record)
	})
}

func TestRecalculateForDate(t *testing.T) {
	t.Run("returns nil when profile is incomplete (no rows)", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		date := time.Date(2026, 3, 6, 0, 0, 0, 0, time.UTC)

		// Check weekly plan - no plan
		mock.ExpectQuery("SELECT calories_goal").
			WithArgs(int64(1), "2026-03-06").
			WillReturnError(sql.ErrNoRows)

		// getUserProfile - no rows
		mock.ExpectQuery("SELECT birth_date").
			WithArgs(int64(1)).
			WillReturnError(sql.ErrNoRows)

		targets, err := service.RecalculateForDate(context.Background(), 1, date)
		require.NoError(t, err)
		assert.Nil(t, targets)
	})

	t.Run("returns nil when no weight data", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		date := time.Date(2026, 3, 6, 0, 0, 0, 0, time.UTC)
		birthDate := time.Date(1990, 1, 1, 0, 0, 0, 0, time.UTC)

		// No weekly plan
		mock.ExpectQuery("SELECT calories_goal").
			WithArgs(int64(1), "2026-03-06").
			WillReturnError(sql.ErrNoRows)

		// getUserProfile
		mock.ExpectQuery("SELECT birth_date").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"birth_date", "biological_sex", "height", "activity_level", "fitness_goal"}).
				AddRow(birthDate, "male", 180.0, "moderate", "maintain"))

		// getLatestWeight - no weight
		mock.ExpectQuery("SELECT weight").
			WithArgs(int64(1), "2026-03-06").
			WillReturnError(sql.ErrNoRows)

		targets, err := service.RecalculateForDate(context.Background(), 1, date)
		require.NoError(t, err)
		assert.Nil(t, targets)
	})

	t.Run("calculates targets for male with moderate activity and maintain goal", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		date := time.Date(2026, 3, 6, 0, 0, 0, 0, time.UTC)
		birthDate := time.Date(1990, 1, 1, 0, 0, 0, 0, time.UTC)

		// No weekly plan
		mock.ExpectQuery("SELECT calories_goal").
			WithArgs(int64(1), "2026-03-06").
			WillReturnError(sql.ErrNoRows)

		// getUserProfile
		mock.ExpectQuery("SELECT birth_date").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"birth_date", "biological_sex", "height", "activity_level", "fitness_goal"}).
				AddRow(birthDate, "male", 180.0, "moderate", "maintain"))

		// getLatestWeight
		mock.ExpectQuery("SELECT weight").
			WithArgs(int64(1), "2026-03-06").
			WillReturnRows(sqlmock.NewRows([]string{"weight"}).AddRow(80.0))

		// getWorkoutForDate - no workout
		mock.ExpectQuery("SELECT workout_type").
			WithArgs(int64(1), "2026-03-06").
			WillReturnError(sql.ErrNoRows)

		// Upsert query
		mock.ExpectExec("INSERT INTO daily_calculated_targets").
			WillReturnResult(sqlmock.NewResult(1, 1))

		targets, err := service.RecalculateForDate(context.Background(), 1, date)
		require.NoError(t, err)
		require.NotNil(t, targets)

		// Verify Mifflin-St Jeor for male: 10*80 + 6.25*180 - 5*age + 5
		// age = 36 (born 1990, date 2026)
		// BMR = 10*80 + 6.25*180 - 5*36 + 5 = 800 + 1125 - 180 + 5 = 1750
		assert.Equal(t, 1750.0, targets.BMR)
		// TDEE = BMR * 1.55 (moderate) = 1750 * 1.55 = 2712.5
		assert.Equal(t, 2712.5, targets.TDEE)
		// maintain: 0% modifier, so calories = TDEE = 2712.5
		assert.Equal(t, 2712.5, targets.Calories)
		assert.Equal(t, 80.0, targets.WeightUsed)
		assert.Equal(t, "calculated", targets.Source)
		assert.Equal(t, 0.0, targets.WorkoutBonus)

		// Protein = 1.6 * 80 = 128g
		assert.Equal(t, 128.0, targets.Protein)
		// Fat = 0.25 * 2712.5 / 9 = 75.3 (rounded to 75.3)
		assert.InDelta(t, 75.3, targets.Fat, 0.1)
	})

	t.Run("applies curator override when weekly plan exists", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		date := time.Date(2026, 3, 6, 0, 0, 0, 0, time.UTC)
		birthDate := time.Date(1990, 1, 1, 0, 0, 0, 0, time.UTC)

		// Weekly plan exists
		mock.ExpectQuery("SELECT calories_goal").
			WithArgs(int64(1), "2026-03-06").
			WillReturnRows(sqlmock.NewRows([]string{"calories_goal", "protein_goal", "fat_goal", "carbs_goal"}).
				AddRow(1800.0, 100.0, 50.0, 200.0))

		// getUserProfile
		mock.ExpectQuery("SELECT birth_date").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"birth_date", "biological_sex", "height", "activity_level", "fitness_goal"}).
				AddRow(birthDate, "male", 180.0, "moderate", "maintain"))

		// getLatestWeight
		mock.ExpectQuery("SELECT weight").
			WithArgs(int64(1), "2026-03-06").
			WillReturnRows(sqlmock.NewRows([]string{"weight"}).AddRow(80.0))

		// getWorkoutForDate - no workout
		mock.ExpectQuery("SELECT workout_type").
			WithArgs(int64(1), "2026-03-06").
			WillReturnError(sql.ErrNoRows)

		// Upsert query
		mock.ExpectExec("INSERT INTO daily_calculated_targets").
			WillReturnResult(sqlmock.NewResult(1, 1))

		targets, err := service.RecalculateForDate(context.Background(), 1, date)
		require.NoError(t, err)
		require.NotNil(t, targets)

		// Curator override values
		assert.Equal(t, 1800.0, targets.Calories)
		assert.Equal(t, 100.0, targets.Protein)
		assert.Equal(t, 50.0, targets.Fat)
		assert.Equal(t, 200.0, targets.Carbs)
		assert.Equal(t, "curator_override", targets.Source)
		// BMR/TDEE still calculated
		assert.Equal(t, 1750.0, targets.BMR)
	})
}

func TestGetHistory(t *testing.T) {
	t.Run("returns history rows", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT").
			WillReturnRows(sqlmock.NewRows([]string{
				"date",
				"t_cal", "t_pro", "t_fat", "t_carbs",
				"bmr", "tdee", "workout_bonus", "weight_used", "source",
				"a_cal", "a_pro", "a_fat", "a_carbs",
			}).
				AddRow("2026-03-05", 2000.0, 120.0, 55.0, 250.0, 1600.0, 2200.0, 0.0, 70.0, "calculated", 1800.0, 100.0, 50.0, 230.0).
				AddRow("2026-03-06", 2000.0, 120.0, 55.0, 250.0, 1600.0, 2200.0, 0.0, 70.0, "calculated", 1900.0, 110.0, 52.0, 240.0))

		history, err := service.GetHistory(context.Background(), 1, 7)
		require.NoError(t, err)
		assert.Len(t, history, 2)

		assert.Equal(t, "2026-03-05", history[0].Date)
		require.NotNil(t, history[0].Target)
		assert.Equal(t, 2000.0, history[0].Target.Calories)
		require.NotNil(t, history[0].Actual)
		assert.Equal(t, 1800.0, history[0].Actual.Calories)

		assert.Equal(t, "2026-03-06", history[1].Date)
		assert.Equal(t, 1900.0, history[1].Actual.Calories)
	})

	t.Run("returns empty when no data", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT").
			WillReturnRows(sqlmock.NewRows([]string{
				"date",
				"t_cal", "t_pro", "t_fat", "t_carbs",
				"bmr", "tdee", "workout_bonus", "weight_used", "source",
				"a_cal", "a_pro", "a_fat", "a_carbs",
			}))

		history, err := service.GetHistory(context.Background(), 1, 7)
		require.NoError(t, err)
		assert.Nil(t, history)
	})

	t.Run("handles null target columns", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT").
			WillReturnRows(sqlmock.NewRows([]string{
				"date",
				"t_cal", "t_pro", "t_fat", "t_carbs",
				"bmr", "tdee", "workout_bonus", "weight_used", "source",
				"a_cal", "a_pro", "a_fat", "a_carbs",
			}).AddRow(
				"2026-03-06",
				nil, nil, nil, nil,
				nil, nil, nil, nil, nil,
				500.0, 30.0, 15.0, 60.0,
			))

		history, err := service.GetHistory(context.Background(), 1, 7)
		require.NoError(t, err)
		assert.Len(t, history, 1)
		assert.Nil(t, history[0].Target)
		require.NotNil(t, history[0].Actual)
		assert.Equal(t, 500.0, history[0].Actual.Calories)
	})
}
