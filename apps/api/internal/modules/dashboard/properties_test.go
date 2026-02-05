package dashboard

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/google/uuid"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// Helper function to create a test service with mock database
func setupTestService(t *testing.T) (*Service, sqlmock.Sqlmock, func()) {
	mockDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("Failed to create mock database: %v", err)
	}

	db := &database.DB{DB: mockDB}
	log := logger.New()

	service := NewService(db, log, nil) // nil for S3Client in tests

	cleanup := func() {
		mockDB.Close()
	}

	return service, mock, cleanup
}

// Note: Service implementation is in service.go

// Property 30: Authentication Validation
// **Validates: Requirements 13.6**
// Property: For all data operations (read, write, update, delete), the system should validate
// user authentication and authorization before processing the request.
//
// This property tests that:
// 1. All database queries include user_id in WHERE clause (authorization check)
// 2. Users can only access their own data
// 3. Coaches can only access data for clients they have active relationships with
// 4. Queries are parameterized to prevent SQL injection
//
// Feature: dashboard, Property 30: Authentication Validation
func TestAuthenticationValidationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100 // Run 100 iterations
	properties := gopter.NewProperties(parameters)

	// Property 1: Daily metrics queries always include user_id check
	properties.Property("GetDailyMetrics includes user_id in WHERE clause", prop.ForAll(
		func(userID int64, date time.Time) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			// Normalize date to midnight UTC (same as service does)
			date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

			// Mock expects query with user_id parameter
			rows := sqlmock.NewRows([]string{
				"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
				"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
			}).AddRow(
				uuid.New().String(),
				userID,
				date,
				2000,
				150,
				60,
				200,
				75.5,
				10000,
				false,
				nil,
				nil,
				time.Now(),
				time.Now(),
			)

			// The query MUST include user_id in WHERE clause for authorization
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnRows(rows)

			// Execute
			result, err := service.GetDailyMetrics(ctx, userID, date)

			// Verify
			if err != nil {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// Property: Result must belong to the requested user
			if result != nil && result.UserID != userID {
				t.Logf("Authorization violation: returned data for user %d when requesting user %d", result.UserID, userID)
				return false
			}

			// Verify mock expectations (ensures parameterized query was used)
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met (query not parameterized or missing user_id check): %v", err)
				return false
			}

			return true
		},
		// Generate random user IDs (positive integers)
		gen.Int64Range(1, 1000000),
		// Generate random dates within last year
		gen.TimeRange(time.Now().AddDate(-1, 0, 0), time.Duration(365*24)*time.Hour),
	))

	// Property 2: Weekly plan queries always include user_id check
	properties.Property("GetWeeklyPlan includes user_id in WHERE clause", prop.ForAll(
		func(userID int64, coachID int64) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()

			// Mock expects query with user_id parameter
			rows := sqlmock.NewRows([]string{
				"id", "user_id", "coach_id", "calories_goal", "protein_goal", "fat_goal", "carbs_goal", "steps_goal",
				"start_date", "end_date", "is_active", "created_at", "updated_at", "created_by",
			}).AddRow(
				uuid.New().String(),
				userID,
				coachID,
				2000,
				150,
				nil,
				nil,
				nil,
				time.Now(),
				time.Now().AddDate(0, 0, 7),
				true,
				time.Now(),
				time.Now(),
				coachID,
			)

			// The query MUST include user_id in WHERE clause for authorization
			mock.ExpectQuery(`SELECT id, user_id, coach_id, calories_goal, protein_goal, fat_goal, carbs_goal, steps_goal, start_date, end_date, is_active, created_at, updated_at, created_by FROM weekly_plans WHERE user_id = \$1 AND is_active = true ORDER BY start_date DESC LIMIT 1`).
				WithArgs(userID).
				WillReturnRows(rows)

			// Execute
			result, err := service.GetWeeklyPlan(ctx, userID)

			// Verify
			if err != nil {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// Property: Result must belong to the requested user
			if result != nil && result.UserID != userID {
				t.Logf("Authorization violation: returned plan for user %d when requesting user %d", result.UserID, userID)
				return false
			}

			// Verify mock expectations
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		// Generate random user IDs
		gen.Int64Range(1, 1000000),
		// Generate random coach IDs
		gen.Int64Range(1, 1000000),
	))

	// Property 3: Task queries always include user_id check
	properties.Property("GetTasks includes user_id in WHERE clause", prop.ForAll(
		func(userID int64, weekNumber int) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()

			// Mock expects query with user_id parameter
			rows := sqlmock.NewRows([]string{
				"id", "user_id", "coach_id", "title", "description", "week_number", "assigned_at",
				"due_date", "completed_at", "status", "created_at", "updated_at",
			}).AddRow(
				uuid.New().String(),
				userID,
				int64(100),
				"Test Task",
				"Test Description",
				weekNumber,
				time.Now(),
				time.Now().AddDate(0, 0, 7),
				nil,
				"active",
				time.Now(),
				time.Now(),
			)

			// The query MUST include user_id in WHERE clause for authorization
			mock.ExpectQuery(`SELECT id, user_id, coach_id, title, description, week_number, assigned_at, due_date, completed_at, status, created_at, updated_at FROM tasks WHERE user_id = \$1 AND week_number = \$2 ORDER BY due_date ASC`).
				WithArgs(userID, weekNumber).
				WillReturnRows(rows)

			// Execute
			results, err := service.GetTasks(ctx, userID, weekNumber)

			// Verify
			if err != nil {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// Property: All results must belong to the requested user
			for _, task := range results {
				if task.UserID != userID {
					t.Logf("Authorization violation: returned task for user %d when requesting user %d", task.UserID, userID)
					return false
				}
			}

			// Verify mock expectations
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		// Generate random user IDs
		gen.Int64Range(1, 1000000),
		// Generate week numbers (1-52)
		gen.IntRange(1, 52),
	))

	// Property 4: Queries use parameterized statements (SQL injection prevention)
	properties.Property("All queries use parameterized statements", prop.ForAll(
		func(userID int64) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			date := time.Now()
			// Normalize date to midnight UTC (same as service does)
			date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

			// Mock expects parameterized query (not string concatenation)
			rows := sqlmock.NewRows([]string{
				"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
				"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
			})

			// If the query uses string concatenation instead of parameters,
			// this expectation will fail
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnRows(rows)

			// Execute
			_, err := service.GetDailyMetrics(ctx, userID, date)

			// Verify
			if err != nil && err != sql.ErrNoRows {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// This will fail if parameterized queries aren't used
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Parameterized query not used (SQL injection risk): %v", err)
				return false
			}

			return true
		},
		// Generate random user IDs including potential SQL injection attempts
		gen.Int64Range(1, 1000000),
	))

	properties.TestingRun(t)
}

// Property: User isolation - users cannot access other users' data
// This tests that even if a malicious user tries to access another user's data,
// the RLS policies and authorization checks prevent it
func TestUserIsolationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Users can only access their own data", prop.ForAll(
		func(requestingUserID int64, dataOwnerUserID int64) bool {
			// Skip if same user (valid access)
			if requestingUserID == dataOwnerUserID {
				return true
			}

			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			date := time.Now()
			// Normalize date to midnight UTC (same as service does)
			date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

			// Mock expects query with requesting user's ID
			rows := sqlmock.NewRows([]string{
				"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
				"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
			})

			// Query should use requesting user's ID, not data owner's ID
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(requestingUserID, date).
				WillReturnRows(rows)

			// Execute with requesting user's ID
			result, err := service.GetDailyMetrics(ctx, requestingUserID, date)

			// Verify
			if err != nil && err != sql.ErrNoRows {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// Property: If data is returned, it must belong to the requesting user
			if result != nil && result.UserID != requestingUserID {
				t.Logf("User isolation violation: user %d accessed data belonging to user %d", requestingUserID, result.UserID)
				return false
			}

			// Property: Data owner's data should not be accessible
			if result != nil && result.UserID == dataOwnerUserID && dataOwnerUserID != requestingUserID {
				t.Logf("User isolation violation: user %d accessed data belonging to user %d", requestingUserID, dataOwnerUserID)
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		// Generate requesting user ID
		gen.Int64Range(1, 1000),
		// Generate data owner user ID (different from requesting user)
		gen.Int64Range(1, 1000),
	))

	properties.TestingRun(t)
}

// Property 31: Coach Plan Validation
// **Validates: Requirements 14.1, 14.2**
// Property: For any weekly plan created by a coach, the system should validate that required
// fields exist (calorie goal, protein goal, valid start/end dates with end >= start) and reject
// invalid plans with error messages.
//
// This property tests that:
// 1. Calorie goal is required and positive
// 2. Protein goal is required and positive
// 3. Start date is required
// 4. End date is required
// 5. End date must be on or after start date
// 6. Invalid plans are rejected with specific error messages
//
// Feature: dashboard, Property 31: Coach Plan Validation
func TestCoachPlanValidationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 1: Valid plans pass validation
	properties.Property("Valid weekly plans pass validation", prop.ForAll(
		func(userID int64, coachID int64, caloriesGoal int, proteinGoal int, daysOffset int) bool {
			// Create valid plan
			plan := &WeeklyPlan{
				ID:           uuid.New().String(),
				UserID:       userID,
				CoachID:      coachID,
				CaloriesGoal: caloriesGoal,
				ProteinGoal:  proteinGoal,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, daysOffset),
				IsActive:     true,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
				CreatedBy:    coachID,
			}

			// Validate
			err := plan.Validate()

			// Property: Valid plans should not return errors
			if err != nil {
				t.Logf("Valid plan rejected: %v", err)
				return false
			}

			return true
		},
		// Generate positive user IDs
		gen.Int64Range(1, 1000000),
		// Generate positive coach IDs
		gen.Int64Range(1, 1000000),
		// Generate positive calorie goals (1000-4000)
		gen.IntRange(1000, 4000),
		// Generate positive protein goals (50-300)
		gen.IntRange(50, 300),
		// Generate positive day offsets (0-30 days)
		gen.IntRange(0, 30),
	))

	// Property 2: Plans with invalid calorie goals are rejected
	properties.Property("Plans with invalid calorie goals are rejected", prop.ForAll(
		func(userID int64, coachID int64, caloriesGoal int) bool {
			plan := &WeeklyPlan{
				ID:           uuid.New().String(),
				UserID:       userID,
				CoachID:      coachID,
				CaloriesGoal: caloriesGoal,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				IsActive:     true,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
				CreatedBy:    coachID,
			}

			err := plan.Validate()

			// Property: Invalid calorie goals should be rejected
			if caloriesGoal <= 0 {
				if err == nil {
					t.Logf("Invalid calorie goal %d was not rejected", caloriesGoal)
					return false
				}
				// Verify error message mentions calories
				if err.Error() != "calories_goal is required and must be positive" {
					t.Logf("Wrong error message for invalid calories: %v", err)
					return false
				}
			} else {
				// Valid calorie goal should not cause error (other fields are valid)
				if err != nil {
					t.Logf("Valid calorie goal %d was rejected: %v", caloriesGoal, err)
					return false
				}
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
		// Generate both valid and invalid calorie goals
		gen.IntRange(-1000, 4000),
	))

	// Property 3: Plans with invalid protein goals are rejected
	properties.Property("Plans with invalid protein goals are rejected", prop.ForAll(
		func(userID int64, coachID int64, proteinGoal int) bool {
			plan := &WeeklyPlan{
				ID:           uuid.New().String(),
				UserID:       userID,
				CoachID:      coachID,
				CaloriesGoal: 2000,
				ProteinGoal:  proteinGoal,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				IsActive:     true,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
				CreatedBy:    coachID,
			}

			err := plan.Validate()

			// Property: Invalid protein goals should be rejected
			if proteinGoal <= 0 {
				if err == nil {
					t.Logf("Invalid protein goal %d was not rejected", proteinGoal)
					return false
				}
				if err.Error() != "protein_goal is required and must be positive" {
					t.Logf("Wrong error message for invalid protein: %v", err)
					return false
				}
			} else {
				if err != nil {
					t.Logf("Valid protein goal %d was rejected: %v", proteinGoal, err)
					return false
				}
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
		// Generate both valid and invalid protein goals
		gen.IntRange(-100, 300),
	))

	// Property 4: Plans with end_date before start_date are rejected
	properties.Property("Plans with end_date before start_date are rejected", prop.ForAll(
		func(userID int64, coachID int64, daysDiff int) bool {
			startDate := time.Now()
			endDate := startDate.AddDate(0, 0, daysDiff)

			plan := &WeeklyPlan{
				ID:           uuid.New().String(),
				UserID:       userID,
				CoachID:      coachID,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    startDate,
				EndDate:      endDate,
				IsActive:     true,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
				CreatedBy:    coachID,
			}

			err := plan.Validate()

			// Property: End date before start date should be rejected
			if daysDiff < 0 {
				if err == nil {
					t.Logf("Invalid date range (end before start) was not rejected")
					return false
				}
				if err.Error() != "end_date must be on or after start_date" {
					t.Logf("Wrong error message for invalid date range: %v", err)
					return false
				}
			} else {
				// Valid date range should not cause error
				if err != nil {
					t.Logf("Valid date range was rejected: %v", err)
					return false
				}
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
		// Generate day differences from -30 to +30
		gen.IntRange(-30, 30),
	))

	// Property 5: Plans with missing user_id are rejected
	properties.Property("Plans with invalid user_id are rejected", prop.ForAll(
		func(userID int64) bool {
			plan := &WeeklyPlan{
				ID:           uuid.New().String(),
				UserID:       userID,
				CoachID:      100,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				IsActive:     true,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
				CreatedBy:    100,
			}

			err := plan.Validate()

			if userID <= 0 {
				if err == nil {
					t.Logf("Invalid user_id %d was not rejected", userID)
					return false
				}
				if err.Error() != "user_id is required and must be positive" {
					t.Logf("Wrong error message for invalid user_id: %v", err)
					return false
				}
			} else {
				if err != nil {
					t.Logf("Valid user_id %d was rejected: %v", userID, err)
					return false
				}
			}

			return true
		},
		// Generate both valid and invalid user IDs
		gen.Int64Range(-100, 1000000),
	))

	// Property 6: Plans with missing coach_id are rejected
	properties.Property("Plans with invalid coach_id are rejected", prop.ForAll(
		func(coachID int64) bool {
			plan := &WeeklyPlan{
				ID:           uuid.New().String(),
				UserID:       100,
				CoachID:      coachID,
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
				IsActive:     true,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
				CreatedBy:    coachID,
			}

			err := plan.Validate()

			if coachID <= 0 {
				if err == nil {
					t.Logf("Invalid coach_id %d was not rejected", coachID)
					return false
				}
				if err.Error() != "coach_id is required and must be positive" {
					t.Logf("Wrong error message for invalid coach_id: %v", err)
					return false
				}
			} else {
				if err != nil {
					t.Logf("Valid coach_id %d was rejected: %v", coachID, err)
					return false
				}
			}

			return true
		},
		// Generate both valid and invalid coach IDs
		gen.Int64Range(-100, 1000000),
	))

	properties.TestingRun(t)
}

// Property 32: Coach Task Validation
// **Validates: Requirements 14.3**
// Property: For any task assigned by a coach, the system should validate that required fields
// exist (title, description, due date) and reject invalid tasks with error messages.
//
// This property tests that:
// 1. Title is required and within length limits
// 2. Description is optional but within length limits if provided
// 3. Due date is required
// 4. Week number is required and positive
// 5. Invalid tasks are rejected with specific error messages
//
// Feature: dashboard, Property 32: Coach Task Validation
func TestCoachTaskValidationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 1: Valid tasks pass validation
	properties.Property("Valid tasks pass validation", prop.ForAll(
		func(userID int64, coachID int64, title string, weekNumber int) bool {
			// Ensure title is within valid length
			if len(title) == 0 || len(title) > 255 {
				return true // Skip invalid inputs for this property
			}

			description := "Test description"
			task := &Task{
				ID:          uuid.New().String(),
				UserID:      userID,
				CoachID:     coachID,
				Title:       title,
				Description: &description,
				WeekNumber:  weekNumber,
				DueDate:     time.Now().AddDate(0, 0, 7),
				Status:      TaskStatusActive,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}

			err := task.Validate()

			// Property: Valid tasks should not return errors
			if err != nil {
				t.Logf("Valid task rejected: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
		// Generate titles of valid length
		gen.AlphaString().SuchThat(func(s string) bool {
			return len(s) > 0 && len(s) <= 255
		}),
		gen.IntRange(1, 52),
	))

	// Property 2: Tasks with empty title are rejected
	properties.Property("Tasks with empty title are rejected", prop.ForAll(
		func(userID int64, coachID int64) bool {
			task := &Task{
				ID:         uuid.New().String(),
				UserID:     userID,
				CoachID:    coachID,
				Title:      "", // Empty title
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}

			err := task.Validate()

			// Property: Empty title should be rejected
			if err == nil {
				t.Logf("Task with empty title was not rejected")
				return false
			}
			if err.Error() != "title is required" {
				t.Logf("Wrong error message for empty title: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
	))

	// Property 3: Tasks with title exceeding 255 characters are rejected
	properties.Property("Tasks with title > 255 chars are rejected", prop.ForAll(
		func(userID int64, coachID int64, titleLength int) bool {
			// Generate title of specified length
			title := ""
			for i := 0; i < titleLength; i++ {
				title += "a"
			}

			task := &Task{
				ID:         uuid.New().String(),
				UserID:     userID,
				CoachID:    coachID,
				Title:      title,
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}

			err := task.Validate()

			// Property: Title > 255 chars should be rejected
			if titleLength > 255 {
				if err == nil {
					t.Logf("Task with title length %d was not rejected", titleLength)
					return false
				}
				if err.Error() != "title must be 255 characters or less" {
					t.Logf("Wrong error message for long title: %v", err)
					return false
				}
			} else if titleLength > 0 {
				// Valid length should not cause error
				if err != nil {
					t.Logf("Task with valid title length %d was rejected: %v", titleLength, err)
					return false
				}
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
		// Generate various title lengths
		gen.IntRange(1, 300),
	))

	// Property 4: Tasks with description exceeding 1000 characters are rejected
	properties.Property("Tasks with description > 1000 chars are rejected", prop.ForAll(
		func(userID int64, coachID int64, descLength int) bool {
			// Generate description of specified length
			desc := ""
			for i := 0; i < descLength; i++ {
				desc += "a"
			}

			task := &Task{
				ID:          uuid.New().String(),
				UserID:      userID,
				CoachID:     coachID,
				Title:       "Test Task",
				Description: &desc,
				WeekNumber:  1,
				DueDate:     time.Now().AddDate(0, 0, 7),
				Status:      TaskStatusActive,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}

			err := task.Validate()

			// Property: Description > 1000 chars should be rejected
			if descLength > 1000 {
				if err == nil {
					t.Logf("Task with description length %d was not rejected", descLength)
					return false
				}
				if err.Error() != "description must be 1000 characters or less" {
					t.Logf("Wrong error message for long description: %v", err)
					return false
				}
			} else {
				// Valid length should not cause error
				if err != nil {
					t.Logf("Task with valid description length %d was rejected: %v", descLength, err)
					return false
				}
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
		// Generate various description lengths
		gen.IntRange(1, 1100),
	))

	// Property 5: Tasks with invalid week_number are rejected
	properties.Property("Tasks with invalid week_number are rejected", prop.ForAll(
		func(userID int64, coachID int64, weekNumber int) bool {
			task := &Task{
				ID:         uuid.New().String(),
				UserID:     userID,
				CoachID:    coachID,
				Title:      "Test Task",
				WeekNumber: weekNumber,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}

			err := task.Validate()

			// Property: Week number <= 0 should be rejected
			if weekNumber <= 0 {
				if err == nil {
					t.Logf("Task with invalid week_number %d was not rejected", weekNumber)
					return false
				}
				if err.Error() != "week_number is required and must be positive" {
					t.Logf("Wrong error message for invalid week_number: %v", err)
					return false
				}
			} else {
				// Valid week number should not cause error
				if err != nil {
					t.Logf("Task with valid week_number %d was rejected: %v", weekNumber, err)
					return false
				}
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
		// Generate both valid and invalid week numbers
		gen.IntRange(-10, 52),
	))

	// Property 6: Tasks with invalid user_id are rejected
	properties.Property("Tasks with invalid user_id are rejected", prop.ForAll(
		func(userID int64) bool {
			task := &Task{
				ID:         uuid.New().String(),
				UserID:     userID,
				CoachID:    100,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}

			err := task.Validate()

			if userID <= 0 {
				if err == nil {
					t.Logf("Task with invalid user_id %d was not rejected", userID)
					return false
				}
				if err.Error() != "user_id is required and must be positive" {
					t.Logf("Wrong error message for invalid user_id: %v", err)
					return false
				}
			} else {
				if err != nil {
					t.Logf("Task with valid user_id %d was rejected: %v", userID, err)
					return false
				}
			}

			return true
		},
		// Generate both valid and invalid user IDs
		gen.Int64Range(-100, 1000000),
	))

	// Property 7: Tasks with invalid coach_id are rejected
	properties.Property("Tasks with invalid coach_id are rejected", prop.ForAll(
		func(coachID int64) bool {
			task := &Task{
				ID:         uuid.New().String(),
				UserID:     100,
				CoachID:    coachID,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     TaskStatusActive,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}

			err := task.Validate()

			if coachID <= 0 {
				if err == nil {
					t.Logf("Task with invalid coach_id %d was not rejected", coachID)
					return false
				}
				if err.Error() != "coach_id is required and must be positive" {
					t.Logf("Wrong error message for invalid coach_id: %v", err)
					return false
				}
			} else {
				if err != nil {
					t.Logf("Task with valid coach_id %d was rejected: %v", coachID, err)
					return false
				}
			}

			return true
		},
		// Generate both valid and invalid coach IDs
		gen.Int64Range(-100, 1000000),
	))

	// Property 8: Tasks with invalid status are rejected
	properties.Property("Tasks with invalid status are rejected", prop.ForAll(
		func(userID int64, coachID int64, statusStr string) bool {
			// Convert string to TaskStatus
			status := TaskStatus(statusStr)

			task := &Task{
				ID:         uuid.New().String(),
				UserID:     userID,
				CoachID:    coachID,
				Title:      "Test Task",
				WeekNumber: 1,
				DueDate:    time.Now().AddDate(0, 0, 7),
				Status:     status,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}

			err := task.Validate()

			// Property: Invalid status should be rejected
			if !status.IsValid() {
				if err == nil {
					t.Logf("Task with invalid status '%s' was not rejected", statusStr)
					return false
				}
				expectedError := fmt.Sprintf("invalid status: %s", status)
				if err.Error() != expectedError {
					t.Logf("Wrong error message for invalid status: got '%v', expected '%s'", err, expectedError)
					return false
				}
			} else {
				// Valid status should not cause error
				if err != nil {
					t.Logf("Task with valid status '%s' was rejected: %v", statusStr, err)
					return false
				}
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.Int64Range(1, 1000000),
		// Generate both valid and invalid status strings
		gen.OneConstOf("active", "completed", "overdue", "invalid", "pending", "cancelled", ""),
	))

	properties.TestingRun(t)
}

// Property 26: Data Persistence Reliability
// **Validates: Requirements 13.1**
// Property: For any metric logged by a user, the system should persist the data to the database
// immediately and make it retrievable on subsequent loads.
//
// This property tests that:
// 1. Any metric saved can be retrieved
// 2. Retrieved data matches saved data
// 3. Data persists across multiple operations
// 4. Updates to existing metrics are persisted correctly
//
// Feature: dashboard, Property 26: Data Persistence Reliability
func TestDataPersistenceReliabilityProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 1: Saved metrics can be retrieved
	properties.Property("Saved metrics are retrievable", prop.ForAll(
		func(userID int64, date time.Time, calories int, protein int, fat int, carbs int, steps int) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			metricID := uuid.New().String()

			// Normalize date
			date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

			// Mock the initial GET (returns empty)
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnError(sql.ErrNoRows)

			// Mock the INSERT/UPDATE (upsert)
			// Arguments: id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration
			// When updating nutrition, steps will be from the existing metrics (could be the generated value)
			mock.ExpectQuery(`INSERT INTO daily_metrics`).
				WithArgs(sqlmock.AnyArg(), userID, date, calories, protein, fat, carbs, nil, sqlmock.AnyArg(), false, nil, nil).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
					"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
				}).AddRow(
					metricID, userID, date, calories, protein, fat, carbs, nil, steps,
					false, nil, nil, time.Now(), time.Now(),
				))

			// Mock the subsequent GET (returns saved data)
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
					"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
				}).AddRow(
					metricID, userID, date, calories, protein, fat, carbs, nil, steps,
					false, nil, nil, time.Now(), time.Now(),
				))

			// Save metric
			metricUpdate := MetricUpdate{
				Type: MetricUpdateTypeNutrition,
				Data: map[string]interface{}{
					"calories": float64(calories),
					"protein":  float64(protein),
					"fat":      float64(fat),
					"carbs":    float64(carbs),
				},
			}

			saved, err := service.SaveMetric(ctx, userID, date, metricUpdate)
			if err != nil {
				t.Logf("Failed to save metric: %v", err)
				return false
			}

			// Retrieve metric
			retrieved, err := service.GetDailyMetrics(ctx, userID, date)
			if err != nil {
				t.Logf("Failed to retrieve metric: %v", err)
				return false
			}

			// Property: Retrieved data must match saved data
			if retrieved == nil {
				t.Logf("Retrieved metric is nil")
				return false
			}

			if retrieved.UserID != saved.UserID {
				t.Logf("UserID mismatch: saved %d, retrieved %d", saved.UserID, retrieved.UserID)
				return false
			}

			if !retrieved.Date.Equal(saved.Date) {
				t.Logf("Date mismatch: saved %v, retrieved %v", saved.Date, retrieved.Date)
				return false
			}

			if retrieved.Calories != saved.Calories {
				t.Logf("Calories mismatch: saved %d, retrieved %d", saved.Calories, retrieved.Calories)
				return false
			}

			if retrieved.Protein != saved.Protein {
				t.Logf("Protein mismatch: saved %d, retrieved %d", saved.Protein, retrieved.Protein)
				return false
			}

			if retrieved.Fat != saved.Fat {
				t.Logf("Fat mismatch: saved %d, retrieved %d", saved.Fat, retrieved.Fat)
				return false
			}

			if retrieved.Carbs != saved.Carbs {
				t.Logf("Carbs mismatch: saved %d, retrieved %d", saved.Carbs, retrieved.Carbs)
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.TimeRange(time.Now().AddDate(-1, 0, 0), time.Duration(365*24)*time.Hour),
		gen.IntRange(0, 5000),   // calories
		gen.IntRange(0, 500),    // protein
		gen.IntRange(0, 200),    // fat
		gen.IntRange(0, 600),    // carbs
		gen.IntRange(0, 50000),  // steps
	))

	// Property 2: Weight data persists correctly
	properties.Property("Weight data persists correctly", prop.ForAll(
		func(userID int64, date time.Time, weight float64) bool {
			// Skip invalid weights
			if weight <= 0 || weight > 500 {
				return true
			}

			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			metricID := uuid.New().String()

			// Normalize date
			date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

			// Mock the initial GET (returns empty)
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnError(sql.ErrNoRows)

			// Mock the INSERT/UPDATE (upsert)
			// Arguments: id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration
			mock.ExpectQuery(`INSERT INTO daily_metrics`).
				WithArgs(sqlmock.AnyArg(), userID, date, sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), weight, sqlmock.AnyArg(), false, nil, nil).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
					"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
				}).AddRow(
					metricID, userID, date, 0, 0, 0, 0, weight, 0,
					false, nil, nil, time.Now(), time.Now(),
				))

			// Mock the subsequent GET (returns saved data)
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
					"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
				}).AddRow(
					metricID, userID, date, 0, 0, 0, 0, weight, 0,
					false, nil, nil, time.Now(), time.Now(),
				))

			// Save weight
			metricUpdate := MetricUpdate{
				Type: MetricUpdateTypeWeight,
				Data: map[string]interface{}{
					"weight": weight,
				},
			}

			saved, err := service.SaveMetric(ctx, userID, date, metricUpdate)
			if err != nil {
				t.Logf("Failed to save weight: %v", err)
				return false
			}

			// Retrieve metric
			retrieved, err := service.GetDailyMetrics(ctx, userID, date)
			if err != nil {
				t.Logf("Failed to retrieve weight: %v", err)
				return false
			}

			// Property: Weight must be persisted and retrievable
			if retrieved == nil || retrieved.Weight == nil {
				t.Logf("Weight not persisted")
				return false
			}

			if saved.Weight == nil {
				t.Logf("Saved weight is nil")
				return false
			}

			// Compare with small tolerance for floating point
			if *retrieved.Weight != *saved.Weight {
				t.Logf("Weight mismatch: saved %.2f, retrieved %.2f", *saved.Weight, *retrieved.Weight)
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.TimeRange(time.Now().AddDate(-1, 0, 0), time.Duration(365*24)*time.Hour),
		gen.Float64Range(40.0, 200.0), // Valid weight range
	))

	// Property 3: Multiple updates to same date persist correctly
	properties.Property("Multiple updates to same date persist correctly", prop.ForAll(
		func(userID int64, date time.Time, calories1 int, calories2 int) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			metricID := uuid.New().String()

			// Normalize date
			date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

			// First save
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnError(sql.ErrNoRows)

			mock.ExpectQuery(`INSERT INTO daily_metrics`).
				WithArgs(sqlmock.AnyArg(), userID, date, calories1, sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), nil, sqlmock.AnyArg(), false, nil, nil).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
					"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
				}).AddRow(
					metricID, userID, date, calories1, 0, 0, 0, nil, 0,
					false, nil, nil, time.Now(), time.Now(),
				))

			// Second save (update)
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
					"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
				}).AddRow(
					metricID, userID, date, calories1, 0, 0, 0, nil, 0,
					false, nil, nil, time.Now(), time.Now(),
				))

			mock.ExpectQuery(`INSERT INTO daily_metrics`).
				WithArgs(sqlmock.AnyArg(), userID, date, calories2, sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), nil, sqlmock.AnyArg(), false, nil, nil).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
					"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
				}).AddRow(
					metricID, userID, date, calories2, 0, 0, 0, nil, 0,
					false, nil, nil, time.Now(), time.Now(),
				))

			// Final GET
			mock.ExpectQuery(`SELECT id, user_id, date, calories, protein, fat, carbs, weight, steps, workout_completed, workout_type, workout_duration, created_at, updated_at FROM daily_metrics WHERE user_id = \$1 AND date = \$2`).
				WithArgs(userID, date).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "date", "calories", "protein", "fat", "carbs", "weight", "steps",
					"workout_completed", "workout_type", "workout_duration", "created_at", "updated_at",
				}).AddRow(
					metricID, userID, date, calories2, 0, 0, 0, nil, 0,
					false, nil, nil, time.Now(), time.Now(),
				))

			// First save
			metricUpdate1 := MetricUpdate{
				Type: MetricUpdateTypeNutrition,
				Data: map[string]interface{}{
					"calories": float64(calories1),
					"protein":  float64(0),
					"fat":      float64(0),
					"carbs":    float64(0),
				},
			}

			_, err := service.SaveMetric(ctx, userID, date, metricUpdate1)
			if err != nil {
				t.Logf("Failed to save first metric: %v", err)
				return false
			}

			// Second save (update)
			metricUpdate2 := MetricUpdate{
				Type: MetricUpdateTypeNutrition,
				Data: map[string]interface{}{
					"calories": float64(calories2),
					"protein":  float64(0),
					"fat":      float64(0),
					"carbs":    float64(0),
				},
			}

			saved, err := service.SaveMetric(ctx, userID, date, metricUpdate2)
			if err != nil {
				t.Logf("Failed to save second metric: %v", err)
				return false
			}

			// Retrieve final state
			retrieved, err := service.GetDailyMetrics(ctx, userID, date)
			if err != nil {
				t.Logf("Failed to retrieve final metric: %v", err)
				return false
			}

			// Property: Final retrieved value should match last saved value
			if retrieved == nil {
				t.Logf("Retrieved metric is nil")
				return false
			}

			if retrieved.Calories != calories2 {
				t.Logf("Calories mismatch after update: expected %d, got %d", calories2, retrieved.Calories)
				return false
			}

			if saved.Calories != calories2 {
				t.Logf("Saved calories mismatch: expected %d, got %d", calories2, saved.Calories)
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000000),
		gen.TimeRange(time.Now().AddDate(-1, 0, 0), time.Duration(365*24)*time.Hour),
		gen.IntRange(1000, 3000), // First calorie value
		gen.IntRange(1000, 3000), // Second calorie value
	))

	properties.TestingRun(t)
}

// Property 34: Coach Authorization
// **Validates: Requirements 14.6**
// Property: For all coach actions (create/update plan, assign/update task, view client data),
// the system should verify the coach has an active relationship with the specific client before processing.
//
// This property tests that:
// 1. Coaches can only create plans for clients they have active relationships with
// 2. Coaches can only update plans for clients they have active relationships with
// 3. Coaches cannot access data for clients without active relationships
// 4. Authorization checks happen before any data operations
//
// Feature: dashboard, Property 34: Coach Authorization
func TestCoachAuthorizationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 1: CreatePlan requires active coach-client relationship
	properties.Property("CreatePlan requires active coach-client relationship", prop.ForAll(
		func(coachID int64, clientID int64, hasRelationship bool) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()

			// Mock the coach-client relationship check
			relationshipRows := sqlmock.NewRows([]string{"exists"}).AddRow(hasRelationship)
			mock.ExpectQuery(`SELECT EXISTS`).
				WithArgs(coachID, clientID).
				WillReturnRows(relationshipRows)

			if hasRelationship {
				// Mock deactivate existing plans
				mock.ExpectExec(`UPDATE weekly_plans SET is_active = false`).
					WithArgs(clientID).
					WillReturnResult(sqlmock.NewResult(0, 0))

				// Mock insert new plan
				mock.ExpectQuery(`INSERT INTO weekly_plans`).
					WithArgs(
						sqlmock.AnyArg(), // id
						clientID,         // user_id
						coachID,          // coach_id
						2000,             // calories_goal
						150,              // protein_goal
						sqlmock.AnyArg(), // fat_goal
						sqlmock.AnyArg(), // carbs_goal
						sqlmock.AnyArg(), // steps_goal
						sqlmock.AnyArg(), // start_date
						sqlmock.AnyArg(), // end_date
						true,             // is_active
						coachID,          // created_by
					).
					WillReturnRows(sqlmock.NewRows([]string{
						"id", "user_id", "coach_id", "calories_goal", "protein_goal", "fat_goal", "carbs_goal", "steps_goal",
						"start_date", "end_date", "is_active", "created_at", "updated_at", "created_by",
					}).AddRow(
						uuid.New().String(), clientID, coachID, 2000, 150, nil, nil, nil,
						time.Now(), time.Now().AddDate(0, 0, 7), true, time.Now(), time.Now(), coachID,
					))
			}

			// Attempt to create plan
			plan := &WeeklyPlan{
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
			}

			result, err := service.CreatePlan(ctx, coachID, clientID, plan)

			// Property: If no active relationship, operation should fail
			if !hasRelationship {
				if err == nil {
					t.Logf("CreatePlan succeeded without active relationship (coach %d, client %d)", coachID, clientID)
					return false
				}
				// Verify error message mentions relationship
				if !contains(err.Error(), "relationship") && !contains(err.Error(), "not have") {
					t.Logf("Error message doesn't mention relationship: %v", err)
					return false
				}
			} else {
				// With active relationship, operation should succeed
				if err != nil {
					t.Logf("CreatePlan failed with active relationship: %v", err)
					return false
				}
				if result == nil {
					t.Logf("CreatePlan returned nil result with active relationship")
					return false
				}
				if result.UserID != clientID || result.CoachID != coachID {
					t.Logf("Plan has wrong user_id or coach_id")
					return false
				}
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000),   // coach ID
		gen.Int64Range(1, 1000),   // client ID
		gen.Bool(),                // has relationship
	))

	// Property 2: UpdatePlan requires active coach-client relationship
	properties.Property("UpdatePlan requires active coach-client relationship", prop.ForAll(
		func(coachID int64, clientID int64, planID string, hasRelationship bool) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()

			// Mock get existing plan
			mock.ExpectQuery(`SELECT id, user_id, coach_id`).
				WithArgs(planID).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "coach_id", "calories_goal", "protein_goal", "fat_goal", "carbs_goal", "steps_goal",
					"start_date", "end_date", "is_active", "created_at", "updated_at", "created_by",
				}).AddRow(
					planID, clientID, coachID, 2000, 150, nil, nil, nil,
					time.Now(), time.Now().AddDate(0, 0, 7), true, time.Now(), time.Now(), coachID,
				))

			// Mock the coach-client relationship check
			relationshipRows := sqlmock.NewRows([]string{"exists"}).AddRow(hasRelationship)
			mock.ExpectQuery(`SELECT EXISTS`).
				WithArgs(coachID, clientID).
				WillReturnRows(relationshipRows)

			if hasRelationship {
				// Mock update plan
				mock.ExpectQuery(`UPDATE weekly_plans SET`).
					WithArgs(
						2500,             // calories_goal
						sqlmock.AnyArg(), // protein_goal
						sqlmock.AnyArg(), // fat_goal
						sqlmock.AnyArg(), // carbs_goal
						sqlmock.AnyArg(), // steps_goal
						sqlmock.AnyArg(), // start_date
						sqlmock.AnyArg(), // end_date
						planID,
					).
					WillReturnRows(sqlmock.NewRows([]string{
						"id", "user_id", "coach_id", "calories_goal", "protein_goal", "fat_goal", "carbs_goal", "steps_goal",
						"start_date", "end_date", "is_active", "created_at", "updated_at", "created_by",
					}).AddRow(
						planID, clientID, coachID, 2500, 150, nil, nil, nil,
						time.Now(), time.Now().AddDate(0, 0, 7), true, time.Now(), time.Now(), coachID,
					))
			}

			// Attempt to update plan
			updates := &WeeklyPlan{
				CaloriesGoal: 2500,
			}

			result, err := service.UpdatePlan(ctx, coachID, planID, updates)

			// Property: If no active relationship, operation should fail
			if !hasRelationship {
				if err == nil {
					t.Logf("UpdatePlan succeeded without active relationship")
					return false
				}
				if !contains(err.Error(), "relationship") && !contains(err.Error(), "not have") {
					t.Logf("Error message doesn't mention relationship: %v", err)
					return false
				}
			} else {
				// With active relationship, operation should succeed
				if err != nil {
					t.Logf("UpdatePlan failed with active relationship: %v", err)
					return false
				}
				if result == nil {
					t.Logf("UpdatePlan returned nil result")
					return false
				}
				if result.CaloriesGoal != 2500 {
					t.Logf("Plan not updated correctly")
					return false
				}
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000),                    // coach ID
		gen.Int64Range(1, 1000),                    // client ID
		gen.Const(uuid.New().String()),             // plan ID
		gen.Bool(),                                 // has relationship
	))

	// Property 3: Coach cannot update plans created by other coaches
	properties.Property("Coach cannot update plans created by other coaches", prop.ForAll(
		func(originalCoachID int64, attemptingCoachID int64, clientID int64, planID string) bool {
			// Skip if same coach
			if originalCoachID == attemptingCoachID {
				return true
			}

			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()

			// Mock get existing plan (created by originalCoachID)
			mock.ExpectQuery(`SELECT id, user_id, coach_id`).
				WithArgs(planID).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "coach_id", "calories_goal", "protein_goal", "fat_goal", "carbs_goal", "steps_goal",
					"start_date", "end_date", "is_active", "created_at", "updated_at", "created_by",
				}).AddRow(
					planID, clientID, originalCoachID, 2000, 150, nil, nil, nil,
					time.Now(), time.Now().AddDate(0, 0, 7), true, time.Now(), time.Now(), originalCoachID,
				))

			// Mock the coach-client relationship check (even if true, should still fail)
			relationshipRows := sqlmock.NewRows([]string{"exists"}).AddRow(true)
			mock.ExpectQuery(`SELECT EXISTS`).
				WithArgs(attemptingCoachID, clientID).
				WillReturnRows(relationshipRows)

			// Attempt to update plan with different coach
			updates := &WeeklyPlan{
				CaloriesGoal: 2500,
			}

			_, err := service.UpdatePlan(ctx, attemptingCoachID, planID, updates)

			// Property: Should fail because coach doesn't own the plan
			if err == nil {
				t.Logf("Coach %d was able to update plan created by coach %d", attemptingCoachID, originalCoachID)
				return false
			}

			// Verify error message mentions authorization
			if !contains(err.Error(), "not authorized") && !contains(err.Error(), "authorized") {
				t.Logf("Error message doesn't mention authorization: %v", err)
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 100),                 // original coach ID
		gen.Int64Range(101, 200),               // attempting coach ID (different range)
		gen.Int64Range(1, 1000),                // client ID
		gen.Const(uuid.New().String()),         // plan ID
	))

	// Property 4: Authorization check happens before data operations
	properties.Property("Authorization check happens before data operations", prop.ForAll(
		func(coachID int64, clientID int64) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()

			// Mock the coach-client relationship check (returns false)
			relationshipRows := sqlmock.NewRows([]string{"exists"}).AddRow(false)
			mock.ExpectQuery(`SELECT EXISTS`).
				WithArgs(coachID, clientID).
				WillReturnRows(relationshipRows)

			// DO NOT mock any data operations - they should not be called

			// Attempt to create plan
			plan := &WeeklyPlan{
				CaloriesGoal: 2000,
				ProteinGoal:  150,
				StartDate:    time.Now(),
				EndDate:      time.Now().AddDate(0, 0, 7),
			}

			_, err := service.CreatePlan(ctx, coachID, clientID, plan)

			// Property: Should fail at authorization check, not at data operation
			if err == nil {
				t.Logf("CreatePlan succeeded without authorization")
				return false
			}

			// Verify only the relationship check was called
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Unexpected database operations after failed authorization: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000), // coach ID
		gen.Int64Range(1, 1000), // client ID
	))

	properties.TestingRun(t)
}

// Helper function to check if string contains substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) &&
		(s[:len(substr)] == substr || s[len(s)-len(substr):] == substr ||
		len(s) > len(substr)+1 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Property 19: Task Status Update
// **Validates: Requirements 9.5**
// Property: For any task marked as complete by a user, the system should update the task status
// to 'completed', set the completed_at timestamp, and display a completion indicator.
//
// Feature: dashboard, Property 19: Task Status Update
func TestTaskStatusUpdateProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Marking task as completed sets status and timestamp
	properties.Property("Marking task as completed sets status and timestamp", prop.ForAll(
		func(userID int64, taskID string) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()

			// Mock get existing task
			mock.ExpectQuery(`SELECT id, user_id, coach_id, title`).
				WithArgs(taskID).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "coach_id", "title", "description", "week_number", "assigned_at",
					"due_date", "completed_at", "status", "created_at", "updated_at",
				}).AddRow(
					taskID, userID, int64(100), "Test Task", "Description", 1, time.Now(),
					time.Now().AddDate(0, 0, 7), nil, TaskStatusActive, time.Now(), time.Now(),
				))

			// Mock update task status
			completedTime := time.Now()
			mock.ExpectQuery(`UPDATE tasks SET status`).
				WithArgs(TaskStatusCompleted, sqlmock.AnyArg(), taskID).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "coach_id", "title", "description", "week_number", "assigned_at",
					"due_date", "completed_at", "status", "created_at", "updated_at",
				}).AddRow(
					taskID, userID, int64(100), "Test Task", "Description", 1, time.Now(),
					time.Now().AddDate(0, 0, 7), completedTime, TaskStatusCompleted, time.Now(), time.Now(),
				))

			// Update task status
			result, err := service.UpdateTaskStatus(ctx, userID, taskID, TaskStatusCompleted)

			// Property: Status should be updated to completed
			if err != nil {
				t.Logf("Failed to update task status: %v", err)
				return false
			}

			if result == nil {
				t.Logf("Result is nil")
				return false
			}

			if result.Status != TaskStatusCompleted {
				t.Logf("Status not updated: expected %s, got %s", TaskStatusCompleted, result.Status)
				return false
			}

			// Property: completed_at timestamp should be set
			if result.CompletedAt == nil {
				t.Logf("completed_at timestamp not set")
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 1000),
		gen.Const(uuid.New().String()),
	))

	// Property: User can only update their own tasks
	properties.Property("User can only update their own tasks", prop.ForAll(
		func(ownerUserID int64, attemptingUserID int64, taskID string) bool {
			// Skip if same user
			if ownerUserID == attemptingUserID {
				return true
			}

			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()

			// Mock get existing task (owned by ownerUserID)
			mock.ExpectQuery(`SELECT id, user_id, coach_id, title`).
				WithArgs(taskID).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "coach_id", "title", "description", "week_number", "assigned_at",
					"due_date", "completed_at", "status", "created_at", "updated_at",
				}).AddRow(
					taskID, ownerUserID, int64(100), "Test Task", "Description", 1, time.Now(),
					time.Now().AddDate(0, 0, 7), nil, TaskStatusActive, time.Now(), time.Now(),
				))

			// Attempt to update task with different user
			_, err := service.UpdateTaskStatus(ctx, attemptingUserID, taskID, TaskStatusCompleted)

			// Property: Should fail because user doesn't own the task
			if err == nil {
				t.Logf("User %d was able to update task owned by user %d", attemptingUserID, ownerUserID)
				return false
			}

			// Verify error message mentions authorization
			if !contains(err.Error(), "not authorized") && !contains(err.Error(), "authorized") {
				t.Logf("Error message doesn't mention authorization: %v", err)
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		gen.Int64Range(1, 100),   // owner user ID
		gen.Int64Range(101, 200), // attempting user ID (different range)
		gen.Const(uuid.New().String()),
	))

	properties.TestingRun(t)
}
