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
	"id", "full_name", "avatar_url",
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
				1800.0, 120.0, 60.0, 200.0,       // today KBZHU
				2000.0, 150.0, 70.0, 250.0).       // plan
			AddRow(2, "Bob", nil,
				800.0, 50.0, 30.0, 100.0,          // today: low calories
				2000.0, 150.0, 70.0, 250.0).       // plan
			AddRow(3, "Charlie", nil,
				0.0, 0.0, 0.0, 0.0,                // no entries
				2000.0, 150.0, 70.0, 250.0)        // plan

		mock.ExpectQuery(`SELECT u\.id, u\.full_name, u\.avatar_url`).
			WithArgs(curatorID).
			WillReturnRows(clientRows)

		// Unread counts: Bob has 3 unread messages
		unreadRows := sqlmock.NewRows(unreadColumns).
			AddRow(2, 3)

		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(unreadRows)

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
		mock.ExpectQuery(`SELECT u\.id, u\.full_name, u\.avatar_url`).
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

		mock.ExpectQuery(`SELECT u\.id, u\.full_name, u\.avatar_url`).
			WithArgs(curatorID).
			WillReturnRows(clientRows)

		unreadRows := sqlmock.NewRows(unreadColumns)
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(unreadRows)

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

	t.Run("returns detail for valid curator-client relationship", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)
		clientID := int64(1)
		date := "2026-02-28"

		// Relationship exists
		mock.ExpectQuery(`SELECT EXISTS`).
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		// Client info
		mock.ExpectQuery(`SELECT id, full_name, avatar_url FROM users`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows([]string{"id", "full_name", "avatar_url"}).
				AddRow(clientID, "Test Client", "https://avatar.example.com/test.jpg"))

		// Food entries
		now := time.Now()
		entryColumns := []string{
			"id", "food_name", "meal_type", "calories", "protein", "fat", "carbs",
			"weight", "created_by", "created_at",
		}
		mock.ExpectQuery(`SELECT id, food_name, meal_type`).
			WithArgs(clientID, sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(entryColumns).
				AddRow("entry-1", "Chicken breast", "lunch", 300.0, 50.0, 8.0, 0.0, 200.0, nil, now).
				AddRow("entry-2", "Rice", "lunch", 200.0, 4.0, 1.0, 45.0, 150.0, int64(100), now))

		// Weekly plan
		planColumns := []string{"calories_goal", "protein_goal", "fat_goal", "carbs_goal"}
		mock.ExpectQuery(`SELECT calories_goal, protein_goal, fat_goal, carbs_goal`).
			WithArgs(clientID, sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(planColumns).
				AddRow(2000.0, 150.0, 70.0, 250.0))

		// Last weight
		mock.ExpectQuery(`SELECT weight FROM daily_metrics`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows([]string{"weight"}).AddRow(75.5))

		// Unread count
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows(unreadColumns).AddRow(clientID, 2))

		detail, err := service.GetClientDetail(ctx, curatorID, clientID, date)

		require.NoError(t, err)
		require.NotNil(t, detail)

		assert.Equal(t, clientID, detail.ID)
		assert.Equal(t, "Test Client", detail.Name)
		assert.Equal(t, "https://avatar.example.com/test.jpg", detail.AvatarURL)

		// Check KBZHU totals (300+200=500 cal, 50+4=54 protein, etc.)
		assert.Equal(t, 500.0, detail.TodayKBZHU.Calories)
		assert.Equal(t, 54.0, detail.TodayKBZHU.Protein)
		assert.Equal(t, 9.0, detail.TodayKBZHU.Fat)
		assert.Equal(t, 45.0, detail.TodayKBZHU.Carbs)

		// Check food entries
		require.Len(t, detail.FoodEntries, 2)
		assert.Equal(t, "Chicken breast", detail.FoodEntries[0].FoodName)
		assert.Equal(t, "lunch", detail.FoodEntries[0].MealType)
		assert.Nil(t, detail.FoodEntries[0].CreatedBy)
		assert.NotNil(t, detail.FoodEntries[1].CreatedBy)
		assert.Equal(t, int64(100), *detail.FoodEntries[1].CreatedBy)

		// Check plan
		require.NotNil(t, detail.WeeklyPlan)
		assert.Equal(t, 2000.0, detail.WeeklyPlan.Calories)
		assert.Equal(t, 150.0, detail.WeeklyPlan.Protein)

		// Check weight
		require.NotNil(t, detail.LastWeight)
		assert.Equal(t, 75.5, *detail.LastWeight)

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

		detail, err := service.GetClientDetail(ctx, curatorID, clientID, "")

		require.Error(t, err)
		assert.Nil(t, detail)
		assert.Contains(t, err.Error(), "unauthorized")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("defaults to today when date is empty", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		curatorID := int64(100)
		clientID := int64(1)

		// Relationship exists
		mock.ExpectQuery(`SELECT EXISTS`).
			WithArgs(curatorID, clientID).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		// Client info
		mock.ExpectQuery(`SELECT id, full_name, avatar_url FROM users`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows([]string{"id", "full_name", "avatar_url"}).
				AddRow(clientID, "Default Date Client", nil))

		// Empty food entries
		entryColumns := []string{
			"id", "food_name", "meal_type", "calories", "protein", "fat", "carbs",
			"weight", "created_by", "created_at",
		}
		mock.ExpectQuery(`SELECT id, food_name, meal_type`).
			WithArgs(clientID, sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(entryColumns))

		// No weekly plan
		planColumns := []string{"calories_goal", "protein_goal", "fat_goal", "carbs_goal"}
		mock.ExpectQuery(`SELECT calories_goal, protein_goal, fat_goal, carbs_goal`).
			WithArgs(clientID, sqlmock.AnyArg()).
			WillReturnRows(sqlmock.NewRows(planColumns))

		// No weight
		mock.ExpectQuery(`SELECT weight FROM daily_metrics`).
			WithArgs(clientID).
			WillReturnRows(sqlmock.NewRows([]string{"weight"}))

		// No unread
		mock.ExpectQuery(`SELECT c\.client_id, COUNT`).
			WithArgs(curatorID).
			WillReturnRows(sqlmock.NewRows(unreadColumns))

		detail, err := service.GetClientDetail(ctx, curatorID, clientID, "")

		require.NoError(t, err)
		require.NotNil(t, detail)
		assert.Equal(t, "Default Date Client", detail.Name)
		assert.Empty(t, detail.FoodEntries)
		assert.Nil(t, detail.WeeklyPlan)
		assert.Nil(t, detail.LastWeight)
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

// Ensure sql package is used (for sql.NullFloat64 in service)
var _ = sql.ErrNoRows
