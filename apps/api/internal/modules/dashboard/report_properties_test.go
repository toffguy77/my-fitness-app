package dashboard

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// Property 20: Weekly Report Validation
// **Validates: Requirements 10.2, 10.3**
// Feature: dashboard, Property 20: Weekly Report Validation
func TestWeeklyReportValidationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Report requires nutrition for >= 5 days
	properties.Property("Report requires nutrition for >= 5 days", prop.ForAll(
		func(userID int64, nutritionDays int) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			weekStart := time.Now().AddDate(0, 0, -7)
			weekEnd := time.Now()

			// Mock nutrition days check
			mock.ExpectQuery(`SELECT COUNT\(DISTINCT date\)`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(nutritionDays))

			// Mock weight days check
			mock.ExpectQuery(`SELECT COUNT\(DISTINCT date\)`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))

			// Mock photo check
			mock.ExpectQuery(`SELECT EXISTS`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

			// Validate
			valid, errors, err := service.ValidateWeekData(ctx, userID, weekStart, weekEnd)

			if err != nil {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// Property: Valid only if >= 5 days
			if nutritionDays >= 5 {
				if !valid {
					t.Logf("Should be valid with %d nutrition days", nutritionDays)
					return false
				}
			} else {
				if valid {
					t.Logf("Should be invalid with %d nutrition days", nutritionDays)
					return false
				}
				if len(errors) == 0 {
					t.Logf("Should have validation errors")
					return false
				}
			}

			return mock.ExpectationsWereMet() == nil
		},
		gen.Int64Range(1, 1000),
		gen.IntRange(0, 7), // nutrition days
	))

	properties.TestingRun(t)
}


// Property 14: Photo File Validation
// **Validates: Requirements 7.3**
// Feature: dashboard, Property 14: Photo File Validation
func TestPhotoFileValidationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Valid photos pass validation
	properties.Property("Valid photos pass validation", prop.ForAll(
		func(fileSize int, mimeType string) bool {
			service, _, cleanup := setupTestService(t)
			defer cleanup()

			err := service.ValidatePhoto(fileSize, mimeType)

			// Property: Valid files should not return errors
			validMimeTypes := map[string]bool{
				"image/jpeg": true,
				"image/png":  true,
				"image/webp": true,
			}

			if fileSize > 0 && fileSize <= 10*1024*1024 && validMimeTypes[mimeType] {
				if err != nil {
					t.Logf("Valid photo rejected: size=%d, mime=%s, err=%v", fileSize, mimeType, err)
					return false
				}
			} else {
				if err == nil {
					t.Logf("Invalid photo accepted: size=%d, mime=%s", fileSize, mimeType)
					return false
				}
			}

			return true
		},
		gen.IntRange(1, 15*1024*1024), // file sizes from 1 byte to 15MB
		gen.OneConstOf("image/jpeg", "image/png", "image/webp", "image/gif", "text/plain", "application/pdf"),
	))

	// Property: Files > 10MB are rejected
	properties.Property("Files > 10MB are rejected", prop.ForAll(
		func(fileSize int) bool {
			service, _, cleanup := setupTestService(t)
			defer cleanup()

			err := service.ValidatePhoto(fileSize, "image/jpeg")

			if fileSize > 10*1024*1024 {
				if err == nil {
					t.Logf("File size %d bytes was not rejected", fileSize)
					return false
				}
				if !contains(err.Error(), "10MB") {
					t.Logf("Error message doesn't mention size limit: %v", err)
					return false
				}
			}

			return true
		},
		gen.IntRange(10*1024*1024+1, 20*1024*1024), // sizes from 10MB+1 to 20MB
	))

	// Property: Invalid mime types are rejected
	properties.Property("Invalid mime types are rejected", prop.ForAll(
		func(mimeType string) bool {
			service, _, cleanup := setupTestService(t)
			defer cleanup()

			err := service.ValidatePhoto(5*1024*1024, mimeType) // 5MB file

			validMimeTypes := map[string]bool{
				"image/jpeg": true,
				"image/png":  true,
				"image/webp": true,
			}

			if !validMimeTypes[mimeType] {
				if err == nil {
					t.Logf("Invalid mime type %s was not rejected", mimeType)
					return false
				}
				if !contains(err.Error(), "mime") {
					t.Logf("Error message doesn't mention mime type: %v", err)
					return false
				}
			}

			return true
		},
		gen.OneConstOf("image/gif", "image/bmp", "text/plain", "application/pdf", "video/mp4", "audio/mp3"),
	))

	properties.TestingRun(t)
}
// Property 21: Weekly Report Creation
// **Validates: Requirements 10.4, 10.5, 10.6, 10.7**
// Feature: dashboard, Property 21: Weekly Report Creation
func TestWeeklyReportCreationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Valid week data creates report record
	properties.Property("Valid week data creates report record", prop.ForAll(
		func(userID int64, coachID int64) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			weekStart := time.Now().AddDate(0, 0, -7)
			weekEnd := time.Now()

			// Mock validation - all requirements met
			mock.ExpectQuery(`SELECT COUNT\(DISTINCT date\)`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5)) // nutrition days

			mock.ExpectQuery(`SELECT COUNT\(DISTINCT date\)`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5)) // weight days

			mock.ExpectQuery(`SELECT EXISTS`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true)) // photo exists

			// Mock coach lookup
			mock.ExpectQuery(`SELECT coach_id FROM coach_client_relationships`).
				WithArgs(userID).
				WillReturnRows(sqlmock.NewRows([]string{"coach_id"}).AddRow(coachID))

			// Mock summary calculation
			mock.ExpectQuery(`SELECT.*FROM daily_metrics`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{
					"days_with_nutrition", "days_with_weight", "days_with_activity",
					"avg_calories", "avg_weight", "total_steps", "workouts_completed",
				}).AddRow(5, 5, 5, 2000.0, 70.5, 50000, 3))

			// Mock photo URL lookup
			mock.ExpectQuery(`SELECT photo_url FROM weekly_photos`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"photo_url"}).AddRow("https://example.com/photo.jpg"))

			// Mock report insertion
			mock.ExpectQuery(`INSERT INTO weekly_reports`).
				WithArgs(
					sqlmock.AnyArg(), // id
					userID,           // user_id
					coachID,          // coach_id
					sqlmock.AnyArg(), // week_start
					sqlmock.AnyArg(), // week_end
					sqlmock.AnyArg(), // week_number
					sqlmock.AnyArg(), // summary
					sqlmock.AnyArg(), // photo_url
					sqlmock.AnyArg(), // submitted_at
					sqlmock.AnyArg(), // reviewed_at
					sqlmock.AnyArg(), // coach_feedback
				).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "user_id", "coach_id", "week_start", "week_end", "week_number",
					"summary", "photo_url", "submitted_at", "reviewed_at", "coach_feedback",
					"created_at", "updated_at",
				}).AddRow(
					"test-id", userID, coachID, weekStart, weekEnd, 1,
					`{"days_with_nutrition":5}`, "https://example.com/photo.jpg",
					time.Now(), nil, nil, time.Now(), time.Now(),
				))

			// Create report
			report, err := service.CreateWeeklyReport(ctx, userID, weekStart, weekEnd)

			if err != nil {
				t.Logf("Failed to create report: %v", err)
				return false
			}

			// Property: Report record is created with correct data
			if report == nil {
				t.Logf("Report is nil")
				return false
			}

			if report.UserID != userID {
				t.Logf("Report user_id mismatch: expected %d, got %d", userID, report.UserID)
				return false
			}

			if report.CoachID != coachID {
				t.Logf("Report coach_id mismatch: expected %d, got %d", coachID, report.CoachID)
				return false
			}

			if report.WeekStart.IsZero() || report.WeekEnd.IsZero() {
				t.Logf("Report dates are zero")
				return false
			}

			if report.SubmittedAt.IsZero() {
				t.Logf("Report submitted_at is zero")
				return false
			}

			if report.Summary == "" {
				t.Logf("Report summary is empty")
				return false
			}

			return mock.ExpectationsWereMet() == nil
		},
		gen.Int64Range(1, 1000),   // userID
		gen.Int64Range(1001, 2000), // coachID
	))

	// Property: Report creation fails without valid data
	properties.Property("Report creation fails without valid data", prop.ForAll(
		func(userID int64, nutritionDays int) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			weekStart := time.Now().AddDate(0, 0, -7)
			weekEnd := time.Now()

			// Mock validation - insufficient nutrition days
			mock.ExpectQuery(`SELECT COUNT\(DISTINCT date\)`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(nutritionDays))

			mock.ExpectQuery(`SELECT COUNT\(DISTINCT date\)`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))

			mock.ExpectQuery(`SELECT EXISTS`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

			// Create report
			report, err := service.CreateWeeklyReport(ctx, userID, weekStart, weekEnd)

			// Property: Creation fails when validation requirements not met
			if nutritionDays < 5 {
				if err == nil {
					t.Logf("Report creation should have failed with %d nutrition days", nutritionDays)
					return false
				}
				if report != nil {
					t.Logf("Report should be nil when creation fails")
					return false
				}
				if !contains(err.Error(), "validation") {
					t.Logf("Error should mention validation failure: %v", err)
					return false
				}
			}

			return mock.ExpectationsWereMet() == nil
		},
		gen.Int64Range(1, 1000), // userID
		gen.IntRange(0, 4),      // insufficient nutrition days
	))

	// Property: Report creation fails without active coach
	properties.Property("Report creation fails without active coach", prop.ForAll(
		func(userID int64) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			weekStart := time.Now().AddDate(0, 0, -7)
			weekEnd := time.Now()

			// Mock validation - all requirements met
			mock.ExpectQuery(`SELECT COUNT\(DISTINCT date\)`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))

			mock.ExpectQuery(`SELECT COUNT\(DISTINCT date\)`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))

			mock.ExpectQuery(`SELECT EXISTS`).
				WithArgs(userID, sqlmock.AnyArg(), sqlmock.AnyArg()).
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

			// Mock coach lookup - no active coach
			mock.ExpectQuery(`SELECT coach_id FROM coach_client_relationships`).
				WithArgs(userID).
				WillReturnError(sql.ErrNoRows)

			// Create report
			report, err := service.CreateWeeklyReport(ctx, userID, weekStart, weekEnd)

			// Property: Creation fails when no active coach found
			if err == nil {
				t.Logf("Report creation should have failed without active coach")
				return false
			}

			if report != nil {
				t.Logf("Report should be nil when creation fails")
				return false
			}

			if !contains(err.Error(), "coach") {
				t.Logf("Error should mention coach not found: %v", err)
				return false
			}

			return mock.ExpectationsWereMet() == nil
		},
		gen.Int64Range(1, 1000), // userID
	))

	properties.TestingRun(t)
}
