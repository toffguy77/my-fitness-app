package curator

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

// setupTestService creates a test service with a mock database
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

// clientColumns defines the columns returned by the main clients query
var clientColumns = []string{
	"id", "name", "avatar_url",
	"today_calories", "today_protein", "today_fat", "today_carbs",
	"plan_calories", "plan_protein", "plan_fat", "plan_carbs",
}

// unreadColumns defines the columns returned by the unread counts query
var unreadColumns = []string{"client_id", "unread_count"}

// ============================================================================
// GetClients Tests
// ============================================================================

func TestGetClients(t *testing.T) {
	ctx := context.Background()

	t.Run("returns clients grouped correctly with alerts first", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		// Client 1: Alice - has good nutrition (no alerts)
		// Client 2: Bob - has low calories (red alert)
		// Client 3: Charlie - no food entries (yellow alert)
		clientRows := sqlmock.NewRows(clientColumns).
			AddRow(1, "Alice", "https://avatar.example.com/alice.jpg",
				1800.0, 120.0, 60.0, 200.0, // today KBZHU
				2000.0, 150.0, 70.0, 250.0). // plan
			AddRow(2, "Bob", nil,
				800.0, 50.0, 30.0, 100.0, // today: low calories
				2000.0, 150.0, 70.0, 250.0). // plan
			AddRow(3, "Charlie", nil,
				0.0, 0.0, 0.0, 0.0, // no entries
				2000.0, 150.0, 70.0, 250.0) // plan

		mock.ExpectQuery(`SELECT u\.id, COALESCE`).
			WithArgs(curatorID).
			WillReturnRows(clientRows)

		// Unread counts: Bob has 3 unread messages
		unreadRows := sqlmock.NewRows(unreadColumns).
			AddRow(2, 3)

		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(unreadRows)

		// Weight data query (getWeightData)
		weightDataColumns := []string{"user_id", "weight", "date"}
		mock.ExpectQuery(`SELECT user_id, weight, date FROM`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows(weightDataColumns))

		// Target weights query (getTargetWeights)
		targetWeightColumns := []string{"user_id", "target_weight"}
		mock.ExpectQuery(`SELECT user_id, target_weight FROM user_settings`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows(targetWeightColumns))

		// Today water query (getTodayWater)
		todayWaterColumns := []string{"user_id", "glasses", "goal", "glass_size"}
		mock.ExpectQuery(`SELECT user_id, glasses, goal, glass_size FROM water_logs`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows(todayWaterColumns))

		// Active/overdue task counts (getActiveTaskCounts)
		mock.ExpectQuery(`SELECT user_id`).
			WithArgs(curatorID, int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "active_count", "overdue_count"}))

		// Weekly KBZHU percent (getWeeklyKBZHUPercent)
		mock.ExpectQuery(`SELECT fe\.user_id`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "actual_cal", "plan_cal_total"}))

		// Last activity dates (getLastActivityDates)
		mock.ExpectQuery(`SELECT user_id, MAX`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "max"}))

		// Streak days (getStreakDays)
		mock.ExpectQuery(`SELECT user_id, date FROM food_entries`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "date"}))

		clients, err := service.GetClients(ctx, curatorID)

		require.NoError(t, err)
		require.Len(t, clients, 3)

		// Bob should come first (red alert + unread messages)
		assert.Equal(t, "Bob", clients[0].Name)
		assert.Equal(t, 3, clients[0].UnreadCount)
		assert.True(t, hasRedOrYellowAlert(clients[0].Alerts))

		// Charlie should come second (yellow alert: no entries)
		assert.Equal(t, "Charlie", clients[1].Name)
		assert.True(t, hasRedOrYellowAlert(clients[1].Alerts))

		// Alice should come last (no alerts)
		assert.Equal(t, "Alice", clients[2].Name)
		assert.Equal(t, 0, clients[2].UnreadCount)
		assert.False(t, hasRedOrYellowAlert(clients[2].Alerts))

		// Verify Alice has correct KBZHU data
		assert.Equal(t, 1800.0, clients[2].TodayKBZHU.Calories)
		assert.Equal(t, 120.0, clients[2].TodayKBZHU.Protein)
		assert.NotNil(t, clients[2].Plan)
		assert.Equal(t, 2000.0, clients[2].Plan.Calories)
		assert.Equal(t, "https://avatar.example.com/alice.jpg", clients[2].AvatarURL)

		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty list when curator has no clients", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		emptyRows := sqlmock.NewRows(clientColumns)
		mock.ExpectQuery(`SELECT u\.id, COALESCE`).
			WithArgs(curatorID).
			WillReturnRows(emptyRows)

		clients, err := service.GetClients(ctx, curatorID)

		require.NoError(t, err)
		assert.Empty(t, clients)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("handles clients without a plan", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		// Client with no plan (NULL values)
		clientRows := sqlmock.NewRows(clientColumns).
			AddRow(1, "NoPlan", nil,
				500.0, 30.0, 20.0, 60.0,
				nil, nil, nil, nil)

		mock.ExpectQuery(`SELECT u\.id, COALESCE`).
			WithArgs(curatorID).
			WillReturnRows(clientRows)

		unreadRows := sqlmock.NewRows(unreadColumns)
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(unreadRows)

		// Weight data query (getWeightData)
		mock.ExpectQuery(`SELECT user_id, weight, date FROM`).
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "weight", "date"}))

		// Target weights query (getTargetWeights)
		mock.ExpectQuery(`SELECT user_id, target_weight FROM user_settings`).
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "target_weight"}))

		// Today water query (getTodayWater)
		mock.ExpectQuery(`SELECT user_id, glasses, goal, glass_size FROM water_logs`).
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "glasses", "goal", "glass_size"}))

		// Active/overdue task counts (getActiveTaskCounts)
		mock.ExpectQuery(`SELECT user_id`).
			WithArgs(curatorID, int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "active_count", "overdue_count"}))

		// Weekly KBZHU percent (getWeeklyKBZHUPercent)
		mock.ExpectQuery(`SELECT fe\.user_id`).
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "actual_cal", "plan_cal_total"}))

		// Last activity dates (getLastActivityDates)
		mock.ExpectQuery(`SELECT user_id, MAX`).
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "max"}))

		// Streak days (getStreakDays)
		mock.ExpectQuery(`SELECT user_id, date FROM food_entries`).
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "date"}))

		clients, err := service.GetClients(ctx, curatorID)

		require.NoError(t, err)
		require.Len(t, clients, 1)
		assert.Nil(t, clients[0].Plan)
		assert.Empty(t, clients[0].Alerts) // No alerts without a plan
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// GetClientDetail Tests
// ============================================================================

func TestGetClientDetail(t *testing.T) {
	ctx := context.Background()

	// clientDetailColumns defines the columns returned by the client info JOIN query
	clientDetailColumns := []string{
		"id", "name", "avatar_url", "email",
		"height", "timezone",
		"telegram_username", "instagram_username",
		"target_weight", "water_goal",
		"birth_date", "biological_sex", "activity_level", "fitness_goal",
	}

	// Helper: set up common mock expectations for a valid client detail call.
	// Returns the mock so callers can add additional expectations or verify.
	setupDetailMocks := func(
		mock sqlmock.Sqlmock,
		curatorID, clientID int64,
		clientName string,
		avatarURL interface{},
	) {
		// Relationship exists
		mock.ExpectQuery(`SELECT EXISTS`).
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		// Client info (JOIN with user_settings)
		mock.ExpectQuery(`SELECT u\.id, COALESCE`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows(clientDetailColumns).
				AddRow(clientID, clientName, avatarURL, "test@example.com",
					175.0, "Europe/Moscow",
					"tg_user", "ig_user",
					70.0, int64(8),
					"1990-01-15", "male", "moderate", "weight_loss"))
	}

	t.Run("returns multi-day detail for valid curator-client relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)
		clientID := int64(1)
		date := "2026-02-28"

		setupDetailMocks(mock, curatorID, clientID, "Test Client", "https://avatar.example.com/test.jpg")

		// Food entries (single day mode since date is provided)
		now := time.Now()
		entryColumns := []string{
			"id", "food_name", "meal_type", "calories", "protein", "fat", "carbs",
			"weight", "created_by", "created_at", "date",
		}
		mock.ExpectQuery(`SELECT id, food_name, meal_type`).
			WithArgs(clientID, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(entryColumns).
				AddRow("entry-1", "Chicken breast", "lunch", 300.0, 50.0, 8.0, 0.0, 200.0, nil, now, time.Date(2026, 2, 28, 0, 0, 0, 0, time.UTC)).
				AddRow("entry-2", "Rice", "lunch", 200.0, 4.0, 1.0, 45.0, 150.0, int64(100), now, time.Date(2026, 2, 28, 0, 0, 0, 0, time.UTC)))

		// Water logs
		waterColumns := []string{"date", "glasses", "goal", "glass_size"}
		mock.ExpectQuery(`SELECT date, glasses, goal, glass_size`).
			WithArgs(clientID, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(waterColumns).
				AddRow(time.Date(2026, 2, 28, 0, 0, 0, 0, time.UTC), 6, 8, 250))

		// Daily metrics (steps, workout)
		metricsColumns := []string{"date", "steps", "workout_completed", "workout_type", "workout_duration"}
		mock.ExpectQuery(`SELECT date, steps, workout_completed`).
			WithArgs(clientID, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(metricsColumns).
				AddRow(time.Date(2026, 2, 28, 0, 0, 0, 0, time.UTC), int64(8500), true, "cardio", 45))

		// Weekly photos
		photoColumns := []string{"id", "photo_url", "week_start", "week_end", "uploaded_at"}
		mock.ExpectQuery(`SELECT id, photo_url, week_start, week_end, uploaded_at`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows(photoColumns).
				AddRow("photo-1", "https://s3.example.com/photo1.jpg",
					time.Date(2026, 2, 24, 0, 0, 0, 0, time.UTC),
					time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC),
					time.Date(2026, 2, 28, 12, 0, 0, 0, time.UTC)))

		// Weekly plan
		planColumns := []string{"calories_goal", "protein_goal", "fat_goal", "carbs_goal"}
		mock.ExpectQuery(`SELECT calories_goal, protein_goal, fat_goal, carbs_goal`).
			WithArgs(clientID, sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(planColumns).
				AddRow(2000.0, 150.0, 70.0, 250.0))

		// Weight history
		mock.ExpectQuery(`SELECT date, weight FROM daily_metrics`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows([]string{"date", "weight"}).
				AddRow(time.Date(2026, 2, 20, 0, 0, 0, 0, time.UTC), 76.0).
				AddRow(time.Date(2026, 2, 27, 0, 0, 0, 0, time.UTC), 75.5))

		// Unread count
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows(unreadColumns).AddRow(clientID, 2))

		detail, err := service.GetClientDetail(ctx, curatorID, clientID, date, 7)

		require.NoError(t, err)
		require.NotNil(t, detail)

		assert.Equal(t, clientID, detail.ID)
		assert.Equal(t, "Test Client", detail.Name)
		assert.Equal(t, "https://avatar.example.com/test.jpg", detail.AvatarURL)
		assert.Equal(t, "test@example.com", detail.Email)
		assert.Equal(t, "Europe/Moscow", detail.Timezone)
		assert.Equal(t, "tg_user", detail.TelegramUsername)
		assert.Equal(t, "ig_user", detail.InstagramUsername)
		require.NotNil(t, detail.Height)
		assert.Equal(t, 175.0, *detail.Height)

		// Check Days (single day mode)
		require.Len(t, detail.Days, 1)
		day := detail.Days[0]
		assert.Equal(t, "2026-02-28", day.Date)

		// Check KBZHU totals on the day (300+200=500 cal, 50+4=54 protein, etc.)
		require.NotNil(t, day.KBZHU)
		assert.Equal(t, 500.0, day.KBZHU.Calories)
		assert.Equal(t, 54.0, day.KBZHU.Protein)
		assert.Equal(t, 9.0, day.KBZHU.Fat)
		assert.Equal(t, 45.0, day.KBZHU.Carbs)

		// Check food entries in the day
		require.Len(t, day.FoodEntries, 2)
		assert.Equal(t, "Chicken breast", day.FoodEntries[0].FoodName)
		assert.Equal(t, "lunch", day.FoodEntries[0].MealType)
		assert.Nil(t, day.FoodEntries[0].CreatedBy)
		assert.NotNil(t, day.FoodEntries[1].CreatedBy)
		assert.Equal(t, int64(100), *day.FoodEntries[1].CreatedBy)

		// Check water
		require.NotNil(t, day.Water)
		assert.Equal(t, 6, day.Water.Glasses)
		assert.Equal(t, 8, day.Water.Goal)
		assert.Equal(t, 250, day.Water.GlassSize)

		// Check steps and workout
		assert.Equal(t, 8500, day.Steps)
		require.NotNil(t, day.Workout)
		assert.True(t, day.Workout.Completed)
		assert.Equal(t, "cardio", day.Workout.Type)
		assert.Equal(t, 45, day.Workout.Duration)

		// Check photos
		require.Len(t, detail.Photos, 1)
		assert.Equal(t, "photo-1", detail.Photos[0].ID)
		assert.Equal(t, "https://s3.example.com/photo1.jpg", detail.Photos[0].PhotoURL)
		assert.Equal(t, "2026-02-24", detail.Photos[0].WeekStart)

		// Check plan
		require.NotNil(t, detail.WeeklyPlan)
		assert.Equal(t, 2000.0, detail.WeeklyPlan.Calories)
		assert.Equal(t, 150.0, detail.WeeklyPlan.Protein)

		// Check weight history
		require.Len(t, detail.WeightHistory, 2)
		assert.Equal(t, 75.5, detail.WeightHistory[1].Weight)

		// Check weight from embedded ClientCard
		require.NotNil(t, detail.LastWeight)
		assert.Equal(t, 75.5, *detail.LastWeight)

		// Check target weight
		require.NotNil(t, detail.TargetWeight)
		assert.Equal(t, 70.0, *detail.TargetWeight)

		// Check unread
		assert.Equal(t, 2, detail.UnreadCount)

		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("rejects non-related curator (unauthorized)", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)
		clientID := int64(999)

		// Relationship does NOT exist
		mock.ExpectQuery(`SELECT EXISTS`).
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		detail, err := service.GetClientDetail(ctx, curatorID, clientID, "", 7)

		require.Error(t, err)
		assert.Nil(t, detail)
		assert.Contains(t, err.Error(), "unauthorized")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("defaults to 7 days when date is empty", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)
		clientID := int64(1)

		setupDetailMocks(mock, curatorID, clientID, "Default Date Client", nil)

		// Empty food entries
		entryColumns := []string{
			"id", "food_name", "meal_type", "calories", "protein", "fat", "carbs",
			"weight", "created_by", "created_at", "date",
		}
		mock.ExpectQuery(`SELECT id, food_name, meal_type`).
			WithArgs(clientID, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(entryColumns))

		// Empty water
		mock.ExpectQuery(`SELECT date, glasses, goal, glass_size`).
			WithArgs(clientID, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows([]string{"date", "glasses", "goal", "glass_size"}))

		// Empty metrics
		mock.ExpectQuery(`SELECT date, steps, workout_completed`).
			WithArgs(clientID, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows([]string{"date", "steps", "workout_completed", "workout_type", "workout_duration"}))

		// Empty photos
		mock.ExpectQuery(`SELECT id, photo_url, week_start, week_end, uploaded_at`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows([]string{"id", "photo_url", "week_start", "week_end", "uploaded_at"}))

		// No weekly plan
		planColumns := []string{"calories_goal", "protein_goal", "fat_goal", "carbs_goal"}
		mock.ExpectQuery(`SELECT calories_goal, protein_goal, fat_goal, carbs_goal`).
			WithArgs(clientID, sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(planColumns))

		// No weight history
		mock.ExpectQuery(`SELECT date, weight FROM daily_metrics`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows([]string{"date", "weight"}))

		// No unread
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows(unreadColumns))

		detail, err := service.GetClientDetail(ctx, curatorID, clientID, "", 7)

		require.NoError(t, err)
		require.NotNil(t, detail)
		assert.Equal(t, "Default Date Client", detail.Name)

		// Should have 7 days (today + 6 previous)
		assert.Len(t, detail.Days, 7)

		// Days should be sorted newest first
		if len(detail.Days) >= 2 {
			assert.True(t, detail.Days[0].Date > detail.Days[1].Date,
				"Days should be sorted newest first: %s > %s", detail.Days[0].Date, detail.Days[1].Date)
		}

		assert.Nil(t, detail.WeeklyPlan)
		assert.Empty(t, detail.WeightHistory)
		assert.Nil(t, detail.LastWeight)
		assert.Empty(t, detail.Photos)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// computeAlerts Tests
// ============================================================================

func TestComputeAlerts(t *testing.T) {
	t.Run("no alerts when within range", func(t *testing.T) {
		today := &DailyKBZHU{Calories: 1900, Protein: 140, Fat: 65, Carbs: 240}
		plan := &PlanKBZHU{Calories: 2000, Protein: 150, Fat: 70, Carbs: 250}

		alerts := computeAlerts(today, plan)
		assert.Empty(t, alerts)
	})

	t.Run("red alert when calories below 50%", func(t *testing.T) {
		today := &DailyKBZHU{Calories: 900, Protein: 60, Fat: 30, Carbs: 100}
		plan := &PlanKBZHU{Calories: 2000, Protein: 150, Fat: 70, Carbs: 250}

		alerts := computeAlerts(today, plan)
		require.NotEmpty(t, alerts)
		assert.Equal(t, "red", alerts[0].Level)
		assert.Contains(t, alerts[0].Message, "ниже нормы")
	})

	t.Run("red alert when calories above 120%", func(t *testing.T) {
		today := &DailyKBZHU{Calories: 2500, Protein: 150, Fat: 70, Carbs: 250}
		plan := &PlanKBZHU{Calories: 2000, Protein: 150, Fat: 70, Carbs: 250}

		alerts := computeAlerts(today, plan)
		require.NotEmpty(t, alerts)
		assert.Equal(t, "red", alerts[0].Level)
		assert.Contains(t, alerts[0].Message, "выше нормы")
	})

	t.Run("yellow alert when no food entries", func(t *testing.T) {
		today := &DailyKBZHU{Calories: 0, Protein: 0, Fat: 0, Carbs: 0}
		plan := &PlanKBZHU{Calories: 2000, Protein: 150, Fat: 70, Carbs: 250}

		alerts := computeAlerts(today, plan)
		require.Len(t, alerts, 1)
		assert.Equal(t, "yellow", alerts[0].Level)
		assert.Contains(t, alerts[0].Message, "Нет записей")
	})

	t.Run("yellow alert when protein deviates > 30%", func(t *testing.T) {
		today := &DailyKBZHU{Calories: 1900, Protein: 90, Fat: 65, Carbs: 240}
		plan := &PlanKBZHU{Calories: 2000, Protein: 150, Fat: 70, Carbs: 250}

		alerts := computeAlerts(today, plan)
		require.NotEmpty(t, alerts)
		foundProteinAlert := false
		for _, a := range alerts {
			if a.Level == "yellow" && assert.ObjectsAreEqual("yellow", a.Level) {
				foundProteinAlert = true
			}
		}
		assert.True(t, foundProteinAlert)
	})

	t.Run("no alerts when plan is nil", func(t *testing.T) {
		today := &DailyKBZHU{Calories: 1900, Protein: 140, Fat: 65, Carbs: 240}

		alerts := computeAlerts(today, nil)
		assert.Empty(t, alerts)
	})
}

// ============================================================================
// Helpers
// ============================================================================

func hasRedOrYellowAlert(alerts []Alert) bool {
	for _, a := range alerts {
		if a.Level == "red" || a.Level == "yellow" {
			return true
		}
	}
	return false
}

// ============================================================================
// Weekly Plan CRUD Tests
// ============================================================================

func TestCreateWeeklyPlan(t *testing.T) {
	ctx := context.Background()

	t.Run("creates plan successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(1)
		clientID := int64(2)
		req := CreateWeeklyPlanRequest{
			Calories:  2000,
			Protein:   150,
			Fat:       70,
			Carbs:     250,
			StartDate: "2026-03-10",
			EndDate:   "2026-03-16",
			Comment:   "Week 1 plan",
		}

		// Verify relationship
		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		// Deactivate existing plans
		mock.ExpectExec("UPDATE weekly_plans SET is_active = false").
			WithArgs(clientID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Insert new plan
		createdAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
		mock.ExpectQuery("INSERT INTO weekly_plans").
			WithArgs(clientID, curatorID, req.Calories, req.Protein, req.Fat, req.Carbs,
				req.StartDate, req.EndDate, req.Comment).
			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at"}).
				AddRow("plan-uuid-123", createdAt))

		plan, err := service.CreateWeeklyPlan(ctx, curatorID, clientID, req)

		require.NoError(t, err)
		require.NotNil(t, plan)
		assert.Equal(t, "plan-uuid-123", plan.ID)
		assert.Equal(t, 2000.0, plan.Calories)
		assert.Equal(t, 150.0, plan.Protein)
		assert.Equal(t, 70.0, plan.Fat)
		assert.Equal(t, 250.0, plan.Carbs)
		assert.Equal(t, "2026-03-10", plan.StartDate)
		assert.Equal(t, "2026-03-16", plan.EndDate)
		assert.Equal(t, "Week 1 plan", plan.Comment)
		assert.True(t, plan.IsActive)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("rejects when no active relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		_, err := service.CreateWeeklyPlan(ctx, 1, 2, CreateWeeklyPlanRequest{
			Calories: 2000, Protein: 150, Fat: 70, Carbs: 250,
			StartDate: "2026-03-10", EndDate: "2026-03-16",
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
	})

	t.Run("rejects when end_date before start_date", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		_, err := service.CreateWeeklyPlan(ctx, 1, 2, CreateWeeklyPlanRequest{
			Calories: 2000, Protein: 150, Fat: 70, Carbs: 250,
			StartDate: "2026-03-16", EndDate: "2026-03-10",
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "end_date must be after start_date")
	})

	t.Run("rejects invalid start_date format", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		_, err := service.CreateWeeklyPlan(ctx, 1, 2, CreateWeeklyPlanRequest{
			Calories: 2000, Protein: 150, Fat: 70, Carbs: 250,
			StartDate: "bad-date", EndDate: "2026-03-16",
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid start_date")
	})
}

func TestUpdateWeeklyPlan(t *testing.T) {
	ctx := context.Background()

	t.Run("updates plan successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(1)
		clientID := int64(2)
		planID := "plan-uuid-123"
		newCal := float64(2200)
		newComment := "Updated"
		req := UpdateWeeklyPlanRequest{Calories: &newCal, Comment: &newComment}

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		startDate := time.Date(2026, 3, 10, 0, 0, 0, 0, time.UTC)
		endDate := time.Date(2026, 3, 16, 0, 0, 0, 0, time.UTC)
		createdAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)

		mock.ExpectQuery("UPDATE weekly_plans SET").
			WithArgs(newCal, newComment, planID, curatorID).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "calories_goal", "protein_goal", "fat_goal", "carbs_goal",
				"start_date", "end_date", "comment", "is_active", "created_at",
			}).AddRow(
				planID, 2200.0, 150.0, 70.0, 250.0,
				startDate, endDate, sql.NullString{String: "Updated", Valid: true}, true, createdAt,
			))

		plan, err := service.UpdateWeeklyPlan(ctx, curatorID, clientID, planID, req)

		require.NoError(t, err)
		require.NotNil(t, plan)
		assert.Equal(t, 2200.0, plan.Calories)
		assert.Equal(t, "Updated", plan.Comment)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns not found for nonexistent plan", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		newCal := float64(2200)
		mock.ExpectQuery("UPDATE weekly_plans SET").
			WithArgs(newCal, "nonexistent", int64(1)).
			WillReturnError(sql.ErrNoRows)

		_, err := service.UpdateWeeklyPlan(ctx, 1, 2, "nonexistent", UpdateWeeklyPlanRequest{Calories: &newCal})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})
}

func TestDeleteWeeklyPlan(t *testing.T) {
	ctx := context.Background()

	t.Run("deletes plan successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		mock.ExpectExec("DELETE FROM weekly_plans").
			WithArgs("plan-uuid-123", int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.DeleteWeeklyPlan(ctx, 1, 2, "plan-uuid-123")

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns not found for nonexistent plan", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		mock.ExpectExec("DELETE FROM weekly_plans").
			WithArgs("nonexistent", int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 0))

		err := service.DeleteWeeklyPlan(ctx, 1, 2, "nonexistent")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("rejects when no active relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		err := service.DeleteWeeklyPlan(ctx, 1, 2, "plan-uuid-123")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
	})
}

func TestGetWeeklyPlans(t *testing.T) {
	ctx := context.Background()

	t.Run("returns plans successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		startDate1 := time.Date(2026, 3, 10, 0, 0, 0, 0, time.UTC)
		endDate1 := time.Date(2026, 3, 16, 0, 0, 0, 0, time.UTC)
		createdAt1 := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)

		startDate2 := time.Date(2026, 3, 3, 0, 0, 0, 0, time.UTC)
		endDate2 := time.Date(2026, 3, 9, 0, 0, 0, 0, time.UTC)
		createdAt2 := time.Date(2026, 3, 3, 12, 0, 0, 0, time.UTC)

		mock.ExpectQuery("SELECT id, calories_goal").
			WithArgs(int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "calories_goal", "protein_goal", "fat_goal", "carbs_goal",
				"start_date", "end_date", "comment", "is_active", "created_at",
			}).
				AddRow("plan-1", 2000.0, 150.0, 70.0, 250.0, startDate1, endDate1,
					sql.NullString{String: "Current", Valid: true}, true, createdAt1).
				AddRow("plan-2", 1800.0, 140.0, 65.0, 230.0, startDate2, endDate2,
					sql.NullString{Valid: false}, false, createdAt2))

		plans, err := service.GetWeeklyPlans(ctx, 1, 2)

		require.NoError(t, err)
		require.Len(t, plans, 2)
		assert.Equal(t, "plan-1", plans[0].ID)
		assert.Equal(t, 2000.0, plans[0].Calories)
		assert.Equal(t, "Current", plans[0].Comment)
		assert.True(t, plans[0].IsActive)
		assert.Equal(t, "plan-2", plans[1].ID)
		assert.Equal(t, "", plans[1].Comment)
		assert.False(t, plans[1].IsActive)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty list when no plans", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		mock.ExpectQuery("SELECT id, calories_goal").
			WithArgs(int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "calories_goal", "protein_goal", "fat_goal", "carbs_goal",
				"start_date", "end_date", "comment", "is_active", "created_at",
			}))

		plans, err := service.GetWeeklyPlans(ctx, 1, 2)

		require.NoError(t, err)
		assert.Empty(t, plans)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("rejects when no active relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		_, err := service.GetWeeklyPlans(ctx, 1, 2)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
	})
}

// ============================================================================
// Task CRUD Tests
// ============================================================================

func TestCreateTask(t *testing.T) {
	ctx := context.Background()

	t.Run("creates task successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(1)
		clientID := int64(2)
		req := CreateTaskRequest{
			Title:      "Take measurements",
			Type:       "measurement",
			Deadline:   "2026-03-15",
			Recurrence: "once",
		}

		// Verify relationship
		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		// Insert task
		createdAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
		mock.ExpectQuery("INSERT INTO tasks").
			WithArgs(clientID, curatorID, req.Title, req.Description, req.Type,
				req.Deadline, req.Recurrence, sqlmock.AnyArg(), 11). // week 11
			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at"}).
				AddRow("task-uuid-1", createdAt))

		task, err := service.CreateTask(ctx, curatorID, clientID, req)

		require.NoError(t, err)
		require.NotNil(t, task)
		assert.Equal(t, "task-uuid-1", task.ID)
		assert.Equal(t, "Take measurements", task.Title)
		assert.Equal(t, "measurement", task.Type)
		assert.Equal(t, "2026-03-15", task.Deadline)
		assert.Equal(t, "once", task.Recurrence)
		assert.Equal(t, "active", task.Status)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("creates recurring task with recurrence_days", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(1)
		clientID := int64(2)
		req := CreateTaskRequest{
			Title:          "Drink 2L water",
			Type:           "habit",
			Deadline:       "2026-03-16",
			Recurrence:     "weekly",
			RecurrenceDays: []int{1, 3, 5},
		}

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		createdAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
		mock.ExpectQuery("INSERT INTO tasks").
			WithArgs(clientID, curatorID, req.Title, req.Description, req.Type,
				req.Deadline, req.Recurrence, sqlmock.AnyArg(), 12).
			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at"}).
				AddRow("task-uuid-2", createdAt))

		task, err := service.CreateTask(ctx, curatorID, clientID, req)

		require.NoError(t, err)
		require.NotNil(t, task)
		assert.Equal(t, "weekly", task.Recurrence)
		assert.Equal(t, []int{1, 3, 5}, task.RecurrenceDays)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("rejects when no active relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		_, err := service.CreateTask(ctx, 1, 2, CreateTaskRequest{
			Title: "Test", Type: "habit", Deadline: "2026-03-15", Recurrence: "once",
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
	})

	t.Run("rejects invalid deadline format", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		_, err := service.CreateTask(ctx, 1, 2, CreateTaskRequest{
			Title: "Test", Type: "habit", Deadline: "bad-date", Recurrence: "once",
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid deadline")
	})
}

func TestGetTasks(t *testing.T) {
	ctx := context.Background()

	t.Run("returns tasks with completions", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(1)
		clientID := int64(2)

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		taskColumns := []string{
			"id", "title", "type", "description", "due_date",
			"recurrence", "recurrence_days", "status", "completed_at", "created_at",
		}
		dueDate := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)
		createdAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)

		mock.ExpectQuery("SELECT t.id, t.title").
			WithArgs(clientID, curatorID).
			WillReturnRows(sqlmock.NewRows(taskColumns).
				AddRow("task-1", "Daily water", "habit", "Drink 2L", dueDate,
					"daily", nil, "active", nil, createdAt).
				AddRow("task-2", "Take measurements", "measurement", "", dueDate,
					"once", nil, "active", nil, createdAt))

		// Completions query
		mock.ExpectQuery("SELECT task_id, completed_date").
			WithArgs("task-1", "task-2").
			WillReturnRows(sqlmock.NewRows([]string{"task_id", "completed_date"}).
				AddRow("task-1", time.Date(2026, 3, 10, 0, 0, 0, 0, time.UTC)).
				AddRow("task-1", time.Date(2026, 3, 9, 0, 0, 0, 0, time.UTC)))

		tasks, err := service.GetTasks(ctx, curatorID, clientID, "")

		require.NoError(t, err)
		require.Len(t, tasks, 2)
		assert.Equal(t, "task-1", tasks[0].ID)
		assert.Equal(t, "Daily water", tasks[0].Title)
		assert.Equal(t, "habit", tasks[0].Type)
		assert.Equal(t, "daily", tasks[0].Recurrence)
		assert.Len(t, tasks[0].Completions, 2)
		assert.Equal(t, "2026-03-10", tasks[0].Completions[0])
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty list when no tasks", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		taskColumns := []string{
			"id", "title", "type", "description", "due_date",
			"recurrence", "recurrence_days", "status", "completed_at", "created_at",
		}
		mock.ExpectQuery("SELECT t.id, t.title").
			WithArgs(int64(2), int64(1)).
			WillReturnRows(sqlmock.NewRows(taskColumns))

		tasks, err := service.GetTasks(ctx, 1, 2, "")

		require.NoError(t, err)
		assert.Empty(t, tasks)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("filters by status", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		taskColumns := []string{
			"id", "title", "type", "description", "due_date",
			"recurrence", "recurrence_days", "status", "completed_at", "created_at",
		}
		dueDate := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)
		createdAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)

		mock.ExpectQuery("SELECT t.id, t.title").
			WithArgs(int64(2), int64(1), "active").
			WillReturnRows(sqlmock.NewRows(taskColumns).
				AddRow("task-1", "Active task", "habit", "", dueDate,
					"once", nil, "active", nil, createdAt))

		// Completions query
		mock.ExpectQuery("SELECT task_id, completed_date").
			WithArgs("task-1").
			WillReturnRows(sqlmock.NewRows([]string{"task_id", "completed_date"}))

		tasks, err := service.GetTasks(ctx, 1, 2, "active")

		require.NoError(t, err)
		require.Len(t, tasks, 1)
		assert.Equal(t, "active", tasks[0].Status)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("rejects when no active relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		_, err := service.GetTasks(ctx, 1, 2, "")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
	})
}

func TestUpdateTask(t *testing.T) {
	ctx := context.Background()

	t.Run("updates task successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(1)
		clientID := int64(2)
		taskID := "task-uuid-1"
		newTitle := "Updated title"
		req := UpdateTaskRequest{Title: &newTitle}

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		dueDate := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)
		createdAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)

		mock.ExpectQuery("UPDATE tasks SET").
			WithArgs(newTitle, taskID, curatorID).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "title", "type", "description", "due_date",
				"recurrence", "recurrence_days", "status", "created_at",
			}).AddRow(
				taskID, "Updated title", "habit", "", dueDate,
				"once", nil, "active", createdAt,
			))

		task, err := service.UpdateTask(ctx, curatorID, clientID, taskID, req)

		require.NoError(t, err)
		require.NotNil(t, task)
		assert.Equal(t, "Updated title", task.Title)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns not found for nonexistent task", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		newTitle := "Updated"
		mock.ExpectQuery("UPDATE tasks SET").
			WithArgs(newTitle, "nonexistent", int64(1)).
			WillReturnError(sql.ErrNoRows)

		_, err := service.UpdateTask(ctx, 1, 2, "nonexistent", UpdateTaskRequest{Title: &newTitle})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("rejects when no active relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		newTitle := "Updated"
		_, err := service.UpdateTask(ctx, 1, 2, "task-1", UpdateTaskRequest{Title: &newTitle})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
	})
}

func TestDeleteTask(t *testing.T) {
	ctx := context.Background()

	t.Run("deletes task successfully", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		mock.ExpectExec("DELETE FROM tasks").
			WithArgs("task-uuid-1", int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.DeleteTask(ctx, 1, 2, "task-uuid-1")

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns not found for nonexistent task", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		mock.ExpectExec("DELETE FROM tasks").
			WithArgs("nonexistent", int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 0))

		err := service.DeleteTask(ctx, 1, 2, "nonexistent")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("rejects when no active relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		err := service.DeleteTask(ctx, 1, 2, "task-uuid-1")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized")
	})
}

// ============================================================================
// GetAnalytics Tests
// ============================================================================

func TestGetAnalytics(t *testing.T) {
	ctx := context.Background()

	t.Run("returns analytics summary with clients", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		// Total clients count
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))

		// Active client IDs
		mock.ExpectQuery(`SELECT client_id FROM curator_client_relationships`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id"}).
				AddRow(int64(1)).AddRow(int64(2)).AddRow(int64(3)))

		// Attention clients count
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

		// Avg KBZHU percent
		mock.ExpectQuery(`SELECT COALESCE\(AVG`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"avg"}).AddRow(85.5))

		// Unread counts
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id", "unread_count"}).
				AddRow(int64(1), 5).AddRow(int64(2), 3))

		// Active tasks
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(10))

		// Overdue tasks
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

		// Completed today
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(4))

		analytics, err := service.GetAnalytics(ctx, curatorID)

		require.NoError(t, err)
		require.NotNil(t, analytics)
		assert.Equal(t, 3, analytics.TotalClients)
		assert.Equal(t, 1, analytics.AttentionClients)
		assert.Equal(t, 85.5, analytics.AvgKBZHUPercent)
		assert.Equal(t, 8, analytics.TotalUnread)
		assert.Equal(t, 2, analytics.ClientsWaiting)
		assert.Equal(t, 10, analytics.ActiveTasks)
		assert.Equal(t, 2, analytics.OverdueTasks)
		assert.Equal(t, 4, analytics.CompletedToday)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty analytics when no clients", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

		analytics, err := service.GetAnalytics(ctx, curatorID)

		require.NoError(t, err)
		require.NotNil(t, analytics)
		assert.Equal(t, 0, analytics.TotalClients)
		assert.Equal(t, 0, analytics.ActiveTasks)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// GetAttentionList Tests
// ============================================================================

func TestGetAttentionList(t *testing.T) {
	ctx := context.Background()

	t.Run("returns attention items sorted by priority", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		// Active client IDs
		mock.ExpectQuery(`SELECT client_id FROM curator_client_relationships`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id"}).
				AddRow(int64(1)).AddRow(int64(2)))

		// Client info
		mock.ExpectQuery(`SELECT id, COALESCE`).
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "avatar_url"}).
				AddRow(int64(1), "Alice", "").
				AddRow(int64(2), "Bob", "https://avatar.example.com/bob.jpg"))

		// Alert query (priority 1)
		mock.ExpectQuery(`SELECT u\.id`).
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"id", "today_cal", "plan_cal"}).
				AddRow(int64(1), 500.0, sql.NullFloat64{Float64: 2000.0, Valid: true}).
				AddRow(int64(2), 1900.0, sql.NullFloat64{Float64: 2000.0, Valid: true}))

		// Overdue tasks (priority 2)
		mock.ExpectQuery(`SELECT t\.user_id, t\.title, t\.due_date`).
			WithArgs(curatorID, int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "title", "due_date"}))

		// Inactive clients (priority 3)
		mock.ExpectQuery(`SELECT u\.id FROM users`).
			WithArgs(int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"id"}))

		// Unread messages (priority 4)
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id", "unread_count"}).
				AddRow(int64(2), 3))

		// Awaiting feedback (priority 5)
		mock.ExpectQuery(`SELECT wr\.user_id, wr\.week_start`).
			WithArgs(curatorID, int64(1), int64(2)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "week_start"}))

		items, err := service.GetAttentionList(ctx, curatorID)

		require.NoError(t, err)
		require.Len(t, items, 2)

		// Alice should be first (priority 1 - low calories)
		assert.Equal(t, int64(1), items[0].ClientID)
		assert.Equal(t, "Alice", items[0].ClientName)
		assert.Equal(t, "low_calories", items[0].Reason)
		assert.Equal(t, 1, items[0].Priority)
		assert.Equal(t, "/curator/clients/1", items[0].ActionURL)

		// Bob should be second (priority 4 - unread messages)
		assert.Equal(t, int64(2), items[1].ClientID)
		assert.Equal(t, "Bob", items[1].ClientName)
		assert.Equal(t, "unread_messages", items[1].Reason)
		assert.Equal(t, 4, items[1].Priority)
		assert.Equal(t, "/curator/chat/2", items[1].ActionURL)
		assert.Equal(t, "https://avatar.example.com/bob.jpg", items[1].ClientAvatar)

		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty list when no clients", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		mock.ExpectQuery(`SELECT client_id FROM curator_client_relationships`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id"}))

		items, err := service.GetAttentionList(ctx, curatorID)

		require.NoError(t, err)
		assert.Empty(t, items)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// GetAnalyticsHistory Tests
// ============================================================================

func TestGetAnalyticsHistory(t *testing.T) {
	ctx := context.Background()

	t.Run("returns daily snapshots", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		snapshotColumns := []string{
			"date", "total_clients", "attention_clients", "avg_kbzhu_percent",
			"total_unread", "active_tasks", "overdue_tasks", "completed_tasks", "avg_client_streak",
		}
		mock.ExpectQuery(`SELECT date, total_clients, attention_clients`).
			WithArgs(curatorID, 7).
			WillReturnRows(sqlmock.NewRows(snapshotColumns).
				AddRow(time.Date(2026, 3, 10, 0, 0, 0, 0, time.UTC), 5, 2, 85.0, 10, 8, 1, 4, 3.5).
				AddRow(time.Date(2026, 3, 9, 0, 0, 0, 0, time.UTC), 5, 1, 82.0, 8, 7, 0, 5, 3.2))

		result, err := service.GetAnalyticsHistory(ctx, curatorID, "daily", 7)

		require.NoError(t, err)
		snapshots := result.([]DailySnapshot)
		assert.Len(t, snapshots, 2)
		assert.Equal(t, "2026-03-10", snapshots[0].Date)
		assert.Equal(t, 5, snapshots[0].TotalClients)
		assert.Equal(t, 85.0, snapshots[0].AvgKBZHUPercent)
		assert.Equal(t, 3.5, snapshots[0].AvgClientStreak)
		assert.Equal(t, "2026-03-09", snapshots[1].Date)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns weekly snapshots", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		weeklyColumns := []string{
			"week_start", "avg_kbzhu_percent", "avg_response_time_hours", "clients_with_feedback",
			"clients_total", "task_completion_rate", "clients_on_track", "clients_off_track", "avg_client_streak",
		}
		mock.ExpectQuery(`SELECT week_start, avg_kbzhu_percent`).
			WithArgs(curatorID, 12).
			WillReturnRows(sqlmock.NewRows(weeklyColumns).
				AddRow(time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC), 87.5, 2.3, 8, 10, 75.0, 7, 3, 4.0))

		result, err := service.GetAnalyticsHistory(ctx, curatorID, "weekly", 12)

		require.NoError(t, err)
		snapshots := result.([]WeeklySnapshot)
		assert.Len(t, snapshots, 1)
		assert.Equal(t, "2026-03-02", snapshots[0].WeekStart)
		assert.Equal(t, 87.5, snapshots[0].AvgKBZHUPercent)
		assert.Equal(t, 2.3, snapshots[0].AvgResponseTimeHours)
		assert.Equal(t, 10, snapshots[0].ClientsTotal)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty daily snapshots", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		snapshotColumns := []string{
			"date", "total_clients", "attention_clients", "avg_kbzhu_percent",
			"total_unread", "active_tasks", "overdue_tasks", "completed_tasks", "avg_client_streak",
		}
		mock.ExpectQuery(`SELECT date, total_clients`).
			WithArgs(curatorID, 7).
			WillReturnRows(sqlmock.NewRows(snapshotColumns))

		result, err := service.GetAnalyticsHistory(ctx, curatorID, "daily", 7)

		require.NoError(t, err)
		snapshots := result.([]DailySnapshot)
		assert.Empty(t, snapshots)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// GetBenchmark Tests
// ============================================================================

func TestGetBenchmark(t *testing.T) {
	ctx := context.Background()

	t.Run("returns own snapshots and platform benchmarks", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		weeklyColumns := []string{
			"week_start", "avg_kbzhu_percent", "avg_response_time_hours", "clients_with_feedback",
			"clients_total", "task_completion_rate", "clients_on_track", "clients_off_track", "avg_client_streak",
		}
		mock.ExpectQuery(`SELECT week_start, avg_kbzhu_percent.*FROM curator_weekly_snapshots`).
			WithArgs(curatorID, 12).
			WillReturnRows(sqlmock.NewRows(weeklyColumns).
				AddRow(time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC), 87.5, 2.3, 8, 10, 75.0, 7, 3, 4.0))

		benchmarkColumns := []string{
			"week_start", "avg_kbzhu_percent", "avg_response_time_hours", "avg_task_completion_rate",
			"avg_feedback_rate", "avg_client_streak", "curator_count",
		}
		mock.ExpectQuery(`SELECT week_start, avg_kbzhu_percent.*FROM platform_weekly_benchmarks`).
			WithArgs(12).
			WillReturnRows(sqlmock.NewRows(benchmarkColumns).
				AddRow(time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC), 80.0, 3.1, 70.0, 65.0, 3.5, 15))

		result, err := service.GetBenchmark(ctx, curatorID, 12)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Len(t, result.OwnSnapshots, 1)
		assert.Equal(t, "2026-03-02", result.OwnSnapshots[0].WeekStart)
		assert.Equal(t, 87.5, result.OwnSnapshots[0].AvgKBZHUPercent)
		assert.Len(t, result.PlatformBenchmarks, 1)
		assert.Equal(t, "2026-03-02", result.PlatformBenchmarks[0].WeekStart)
		assert.Equal(t, 80.0, result.PlatformBenchmarks[0].AvgKBZHUPercent)
		assert.Equal(t, 15, result.PlatformBenchmarks[0].CuratorCount)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty when no data", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		weeklyColumns := []string{
			"week_start", "avg_kbzhu_percent", "avg_response_time_hours", "clients_with_feedback",
			"clients_total", "task_completion_rate", "clients_on_track", "clients_off_track", "avg_client_streak",
		}
		mock.ExpectQuery(`SELECT week_start, avg_kbzhu_percent.*FROM curator_weekly_snapshots`).
			WithArgs(curatorID, 4).
			WillReturnRows(sqlmock.NewRows(weeklyColumns))

		benchmarkColumns := []string{
			"week_start", "avg_kbzhu_percent", "avg_response_time_hours", "avg_task_completion_rate",
			"avg_feedback_rate", "avg_client_streak", "curator_count",
		}
		mock.ExpectQuery(`SELECT week_start, avg_kbzhu_percent.*FROM platform_weekly_benchmarks`).
			WithArgs(4).
			WillReturnRows(sqlmock.NewRows(benchmarkColumns))

		result, err := service.GetBenchmark(ctx, curatorID, 4)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Empty(t, result.OwnSnapshots)
		assert.Empty(t, result.PlatformBenchmarks)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// CollectDailySnapshot Tests
// ============================================================================

func TestCollectDailySnapshot(t *testing.T) {
	ctx := context.Background()

	t.Run("collects and upserts daily snapshot", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		// GetAnalytics expectations (reused from GetAnalytics flow)
		// Total clients count
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))

		// Active client IDs (for GetAnalytics)
		mock.ExpectQuery(`SELECT client_id FROM curator_client_relationships`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id"}).
				AddRow(int64(1)).AddRow(int64(2)).AddRow(int64(3)))

		// Attention clients count
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

		// Avg KBZHU percent
		mock.ExpectQuery(`SELECT COALESCE\(AVG`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"avg"}).AddRow(85.5))

		// Unread counts
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id", "unread_count"}).
				AddRow(int64(1), 5))

		// Active tasks
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(10))

		// Overdue tasks
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

		// Completed today
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(4))

		// Active client IDs for streaks
		mock.ExpectQuery(`SELECT client_id FROM curator_client_relationships`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id"}).
				AddRow(int64(1)).AddRow(int64(2)).AddRow(int64(3)))

		// Streak query
		mock.ExpectQuery(`SELECT user_id, date FROM food_entries`).
			WithArgs(int64(1), int64(2), int64(3)).
			WillReturnRows(sqlmock.NewRows([]string{"user_id", "date"}))

		// INSERT ... ON CONFLICT
		mock.ExpectExec(`INSERT INTO curator_daily_snapshots`).
			WithArgs(curatorID, 3, 1, 85.5, 5, 10, 2, 4, 0.0).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.CollectDailySnapshot(ctx, curatorID)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("handles zero clients", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)

		// Total clients count = 0
		mock.ExpectQuery(`SELECT COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

		// Active client IDs (for streaks) - empty
		mock.ExpectQuery(`SELECT client_id FROM curator_client_relationships`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows([]string{"client_id"}))

		// INSERT ... ON CONFLICT
		mock.ExpectExec(`INSERT INTO curator_daily_snapshots`).
			WithArgs(curatorID, 0, 0, 0.0, 0, 0, 0, 0, 0.0).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.CollectDailySnapshot(ctx, curatorID)

		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// Ensure sql package is used (for sql.NullFloat64 in service)
var _ = sql.ErrNoRows
