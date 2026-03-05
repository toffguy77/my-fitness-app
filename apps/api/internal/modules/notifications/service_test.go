package notifications

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/google/uuid"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
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

func TestGetNotifications(t *testing.T) {
	ctx := context.Background()

	t.Run("successfully retrieves notifications with pagination", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		category := CategoryMain
		limit := 50
		offset := 0

		// Mock the notifications query
		rows := sqlmock.NewRows([]string{
			"id", "user_id", "category", "type", "title", "content", "icon_url", "created_at", "read_at", "action_url", "content_category",
		}).
			AddRow(uuid.New().String(), userID, CategoryMain, TypeTrainerFeedback, "Test Title 1", "Test Content 1", nil, time.Now(), nil, nil, nil).
			AddRow(uuid.New().String(), userID, CategoryMain, TypeAchievement, "Test Title 2", "Test Content 2", nil, time.Now(), nil, nil, nil)

		mock.ExpectQuery(`SELECT id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category`).
			WithArgs(userID, category, limit, offset).
			WillReturnRows(rows)

		// Mock the count query
		countRows := sqlmock.NewRows([]string{"count"}).AddRow(10)
		mock.ExpectQuery(`SELECT COUNT\(\*\)`).
			WithArgs(userID, category).
			WillReturnRows(countRows)

		// Execute
		result, err := service.GetNotifications(ctx, userID, category, limit, offset)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Len(t, result.Notifications, 2)
		assert.Equal(t, 10, result.Total)
		assert.True(t, result.HasMore)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns empty list when no notifications", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		category := CategoryContent
		limit := 50
		offset := 0

		// Mock empty notifications query
		rows := sqlmock.NewRows([]string{
			"id", "user_id", "category", "type", "title", "content", "icon_url", "created_at", "read_at", "action_url", "content_category",
		})

		mock.ExpectQuery(`SELECT id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category`).
			WithArgs(userID, category, limit, offset).
			WillReturnRows(rows)

		// Mock count query
		countRows := sqlmock.NewRows([]string{"count"}).AddRow(0)
		mock.ExpectQuery(`SELECT COUNT\(\*\)`).
			WithArgs(userID, category).
			WillReturnRows(countRows)

		// Execute
		result, err := service.GetNotifications(ctx, userID, category, limit, offset)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Len(t, result.Notifications, 0)
		assert.Equal(t, 0, result.Total)
		assert.False(t, result.HasMore)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("enforces maximum limit of 100", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		category := CategoryMain
		limit := 200 // Request more than max
		offset := 0

		// Mock should receive limit of 100
		rows := sqlmock.NewRows([]string{
			"id", "user_id", "category", "type", "title", "content", "icon_url", "created_at", "read_at", "action_url", "content_category",
		})

		mock.ExpectQuery(`SELECT id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category`).
			WithArgs(userID, category, 100, offset). // Should be capped at 100
			WillReturnRows(rows)

		countRows := sqlmock.NewRows([]string{"count"}).AddRow(0)
		mock.ExpectQuery(`SELECT COUNT\(\*\)`).
			WithArgs(userID, category).
			WillReturnRows(countRows)

		// Execute
		_, err := service.GetNotifications(ctx, userID, category, limit, offset)

		// Assert
		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error for invalid category", func(t *testing.T) {
		service, _, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		category := NotificationCategory("invalid")
		limit := 50
		offset := 0

		// Execute
		result, err := service.GetNotifications(ctx, userID, category, limit, offset)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "invalid category")
	})
}

func TestMarkAsRead(t *testing.T) {
	ctx := context.Background()

	t.Run("successfully marks notification as read", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		notificationID := uuid.New().String()
		readAt := time.Now()

		// Mock the update query
		rows := sqlmock.NewRows([]string{"read_at"}).AddRow(readAt)
		mock.ExpectQuery(`UPDATE notifications SET read_at = NOW\(\)`).
			WithArgs(notificationID, userID).
			WillReturnRows(rows)

		// Execute
		result, err := service.MarkAsRead(ctx, userID, notificationID)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error for invalid UUID", func(t *testing.T) {
		service, _, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		notificationID := "invalid-uuid"

		// Execute
		result, err := service.MarkAsRead(ctx, userID, notificationID)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "invalid notification ID format")
	})

	t.Run("returns error when notification not found", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		notificationID := uuid.New().String()

		// Mock query returning no rows
		mock.ExpectQuery(`UPDATE notifications SET read_at = NOW\(\)`).
			WithArgs(notificationID, userID).
			WillReturnError(sql.ErrNoRows)

		// Execute
		result, err := service.MarkAsRead(ctx, userID, notificationID)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "notification not found or already read")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestMarkAllAsRead(t *testing.T) {
	ctx := context.Background()

	t.Run("successfully marks all notifications as read", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		category := CategoryMain

		// Mock the update query
		mock.ExpectExec(`UPDATE notifications SET read_at = NOW\(\)`).
			WithArgs(userID, category).
			WillReturnResult(sqlmock.NewResult(0, 5)) // 5 rows affected

		// Execute
		count, err := service.MarkAllAsRead(ctx, userID, category)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, 5, count)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns 0 when no unread notifications", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		category := CategoryContent

		// Mock the update query
		mock.ExpectExec(`UPDATE notifications SET read_at = NOW\(\)`).
			WithArgs(userID, category).
			WillReturnResult(sqlmock.NewResult(0, 0)) // 0 rows affected

		// Execute
		count, err := service.MarkAllAsRead(ctx, userID, category)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, 0, count)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error for invalid category", func(t *testing.T) {
		service, _, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		category := NotificationCategory("invalid")

		// Execute
		count, err := service.MarkAllAsRead(ctx, userID, category)

		// Assert
		assert.Error(t, err)
		assert.Equal(t, 0, count)
		assert.Contains(t, err.Error(), "invalid category")
	})
}

func TestGetUnreadCounts(t *testing.T) {
	ctx := context.Background()

	t.Run("successfully retrieves unread counts", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)

		// Mock the query
		rows := sqlmock.NewRows([]string{"category", "count"}).
			AddRow(CategoryMain, 5).
			AddRow(CategoryContent, 12)

		mock.ExpectQuery(`SELECT category, COUNT\(\*\) as count`).
			WithArgs(userID).
			WillReturnRows(rows)

		// Execute
		result, err := service.GetUnreadCounts(ctx, userID)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Equal(t, 5, result.Main)
		assert.Equal(t, 12, result.Content)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns zeros when no unread notifications", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)

		// Mock empty query
		rows := sqlmock.NewRows([]string{"category", "count"})

		mock.ExpectQuery(`SELECT category, COUNT\(\*\) as count`).
			WithArgs(userID).
			WillReturnRows(rows)

		// Execute
		result, err := service.GetUnreadCounts(ctx, userID)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, result)
		assert.Equal(t, 0, result.Main)
		assert.Equal(t, 0, result.Content)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestCreateNotification(t *testing.T) {
	ctx := context.Background()

	t.Run("successfully creates notification", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		notification := &Notification{
			UserID:    1,
			Category:  CategoryMain,
			Type:      TypeTrainerFeedback,
			Title:     "Test Notification",
			Content:   "Test content",
			CreatedAt: time.Now(),
		}

		// Mock the insert query
		rows := sqlmock.NewRows([]string{"id", "created_at"}).
			AddRow(uuid.New().String(), time.Now())

		mock.ExpectQuery(`INSERT INTO notifications`).
			WithArgs(
				sqlmock.AnyArg(), // id (generated UUID)
				notification.UserID,
				notification.Category,
				notification.Type,
				notification.Title,
				notification.Content,
				notification.IconURL,
				sqlmock.AnyArg(), // created_at
				notification.ReadAt,
				notification.ActionURL,
				notification.ContentCategory,
			).
			WillReturnRows(rows)

		// Execute
		err := service.CreateNotification(ctx, notification)

		// Assert
		require.NoError(t, err)
		assert.NotEmpty(t, notification.ID)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error for invalid notification", func(t *testing.T) {
		service, _, cleanup := setupTestService(t)
		defer cleanup()

		notification := &Notification{
			// Missing required fields
			UserID: 0,
		}

		// Execute
		err := service.CreateNotification(ctx, notification)

		// Assert
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "validation failed")
	})

	t.Run("validates title length", func(t *testing.T) {
		service, _, cleanup := setupTestService(t)
		defer cleanup()

		longTitle := string(make([]byte, 256)) // 256 characters, exceeds limit
		notification := &Notification{
			UserID:   1,
			Category: CategoryMain,
			Type:     TypeGeneral,
			Title:    longTitle,
			Content:  "Test content",
		}

		// Execute
		err := service.CreateNotification(ctx, notification)

		// Assert
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "title must be 255 characters or less")
	})
}

// Test parameterized queries to ensure SQL injection prevention
func TestParameterizedQueries(t *testing.T) {
	ctx := context.Background()

	t.Run("GetNotifications uses parameterized query", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		category := CategoryMain

		// Mock with specific parameters
		rows := sqlmock.NewRows([]string{
			"id", "user_id", "category", "type", "title", "content", "icon_url", "created_at", "read_at", "action_url", "content_category",
		})
		mock.ExpectQuery(`SELECT id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category`).
			WithArgs(userID, category, 50, 0).
			WillReturnRows(rows)

		countRows := sqlmock.NewRows([]string{"count"}).AddRow(0)
		mock.ExpectQuery(`SELECT COUNT\(\*\)`).
			WithArgs(userID, category).
			WillReturnRows(countRows)

		// Execute
		_, err := service.GetNotifications(ctx, userID, category, 50, 0)

		// Assert - if parameterized queries weren't used, this would fail
		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("MarkAsRead uses parameterized query with user_id check", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(1)
		notificationID := uuid.New().String()

		// Mock expects both notification ID and user ID as parameters
		rows := sqlmock.NewRows([]string{"read_at"}).AddRow(time.Now())
		mock.ExpectQuery(`UPDATE notifications SET read_at = NOW\(\)`).
			WithArgs(notificationID, userID).
			WillReturnRows(rows)

		// Execute
		_, err := service.MarkAsRead(ctx, userID, notificationID)

		// Assert
		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// Property-Based Tests

// TestGetNotificationsPaginationProperty tests Property 12: Pagination Limit
// **Validates: Requirements 4.2**
// Property: For any notification fetch request, the system should return at most 50 notifications per request,
// ordered by creation date (most recent first)
func TestGetNotificationsPaginationProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100 // Run 100 iterations
	properties := gopter.NewProperties(parameters)

	properties.Property("GetNotifications returns at most 50 notifications by default and orders by created_at DESC", prop.ForAll(
		func(totalNotifications int, requestedLimit int, offset int) bool {
			// Setup test service
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			userID := int64(1)
			category := CategoryMain

			// Determine the effective limit (should be capped at 50 by default, max 100)
			effectiveLimit := requestedLimit
			if effectiveLimit <= 0 {
				effectiveLimit = 50 // Default limit
			}
			if effectiveLimit > 100 {
				effectiveLimit = 100 // Max limit
			}

			// Calculate how many notifications should be returned
			remainingNotifications := totalNotifications - offset
			if remainingNotifications < 0 {
				remainingNotifications = 0
			}
			expectedCount := remainingNotifications
			if expectedCount > effectiveLimit {
				expectedCount = effectiveLimit
			}

			// Create mock rows with timestamps in descending order
			rows := sqlmock.NewRows([]string{
				"id", "user_id", "category", "type", "title", "content", "icon_url", "created_at", "read_at", "action_url", "content_category",
			})

			// Add rows with descending timestamps to verify ordering
			baseTime := time.Now()
			for i := 0; i < expectedCount; i++ {
				// Each notification is 1 hour older than the previous
				createdAt := baseTime.Add(-time.Duration(offset+i) * time.Hour)
				rows.AddRow(
					uuid.New().String(),
					userID,
					category,
					TypeGeneral,
					"Test Title",
					"Test Content",
					nil,
					createdAt,
					nil,
					nil,
					nil,
				)
			}

			// Mock the query with the effective limit
			mock.ExpectQuery(`SELECT id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category`).
				WithArgs(userID, category, effectiveLimit, offset).
				WillReturnRows(rows)

			// Mock the count query
			countRows := sqlmock.NewRows([]string{"count"}).AddRow(totalNotifications)
			mock.ExpectQuery(`SELECT COUNT\(\*\)`).
				WithArgs(userID, category).
				WillReturnRows(countRows)

			// Execute
			result, err := service.GetNotifications(ctx, userID, category, requestedLimit, offset)

			// Verify no error
			if err != nil {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// Property 1: Should return at most the effective limit (50 by default, 100 max)
			if len(result.Notifications) > effectiveLimit {
				t.Logf("Expected at most %d notifications, got %d", effectiveLimit, len(result.Notifications))
				return false
			}

			// Property 2: Should return exactly expectedCount notifications
			if len(result.Notifications) != expectedCount {
				t.Logf("Expected %d notifications, got %d (total=%d, offset=%d, limit=%d)",
					expectedCount, len(result.Notifications), totalNotifications, offset, effectiveLimit)
				return false
			}

			// Property 3: Notifications should be ordered by created_at DESC (most recent first)
			for i := 1; i < len(result.Notifications); i++ {
				if result.Notifications[i].CreatedAt.After(result.Notifications[i-1].CreatedAt) {
					t.Logf("Notifications not ordered by created_at DESC: notification[%d] (%v) is after notification[%d] (%v)",
						i, result.Notifications[i].CreatedAt, i-1, result.Notifications[i-1].CreatedAt)
					return false
				}
			}

			// Property 4: Total should match the input total
			if result.Total != totalNotifications {
				t.Logf("Expected total %d, got %d", totalNotifications, result.Total)
				return false
			}

			// Property 5: HasMore should be true if there are more notifications beyond current page
			expectedHasMore := (offset + len(result.Notifications)) < totalNotifications
			if result.HasMore != expectedHasMore {
				t.Logf("Expected HasMore=%v, got %v (offset=%d, count=%d, total=%d)",
					expectedHasMore, result.HasMore, offset, len(result.Notifications), totalNotifications)
				return false
			}

			// Verify mock expectations
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		// Generate total notifications between 0 and 200
		gen.IntRange(0, 200),
		// Generate requested limit between -10 and 150 (to test default and max capping)
		gen.IntRange(-10, 150),
		// Generate offset between 0 and 100
		gen.IntRange(0, 100),
	))

	properties.TestingRun(t)
}

// TestGetNotificationsPaginationDefaultLimit tests that default limit is 50
// **Validates: Requirements 4.2**
func TestGetNotificationsPaginationDefaultLimit(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 50
	properties := gopter.NewProperties(parameters)

	properties.Property("GetNotifications uses default limit of 50 when limit <= 0", prop.ForAll(
		func(totalNotifications int) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			userID := int64(1)
			category := CategoryMain
			requestedLimit := 0 // Request with no limit
			offset := 0

			// Should default to 50
			expectedLimit := 50
			expectedCount := totalNotifications
			if expectedCount > expectedLimit {
				expectedCount = expectedLimit
			}

			// Create mock rows
			rows := sqlmock.NewRows([]string{
				"id", "user_id", "category", "type", "title", "content", "icon_url", "created_at", "read_at", "action_url", "content_category",
			})

			for i := 0; i < expectedCount; i++ {
				rows.AddRow(
					uuid.New().String(),
					userID,
					category,
					TypeGeneral,
					"Test Title",
					"Test Content",
					nil,
					time.Now().Add(-time.Duration(i)*time.Hour),
					nil,
					nil,
					nil,
				)
			}

			// Mock expects limit of 50
			mock.ExpectQuery(`SELECT id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category`).
				WithArgs(userID, category, 50, offset).
				WillReturnRows(rows)

			countRows := sqlmock.NewRows([]string{"count"}).AddRow(totalNotifications)
			mock.ExpectQuery(`SELECT COUNT\(\*\)`).
				WithArgs(userID, category).
				WillReturnRows(countRows)

			// Execute with limit 0
			result, err := service.GetNotifications(ctx, userID, category, requestedLimit, offset)

			if err != nil {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// Should return at most 50 notifications
			if len(result.Notifications) > 50 {
				t.Logf("Expected at most 50 notifications with default limit, got %d", len(result.Notifications))
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		// Generate total notifications between 0 and 150
		gen.IntRange(0, 150),
	))

	properties.TestingRun(t)
}

// TestGetNotificationsPaginationMaxLimit tests that maximum limit is 100
// **Validates: Requirements 4.2**
func TestGetNotificationsPaginationMaxLimit(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 50
	properties := gopter.NewProperties(parameters)

	properties.Property("GetNotifications caps limit at 100 even when higher limit requested", prop.ForAll(
		func(requestedLimit int, totalNotifications int) bool {
			service, mock, cleanup := setupTestService(t)
			defer cleanup()

			ctx := context.Background()
			userID := int64(1)
			category := CategoryContent
			offset := 0

			// Should be capped at 100
			expectedLimit := 100
			expectedCount := totalNotifications
			if expectedCount > expectedLimit {
				expectedCount = expectedLimit
			}

			// Create mock rows
			rows := sqlmock.NewRows([]string{
				"id", "user_id", "category", "type", "title", "content", "icon_url", "created_at", "read_at", "action_url", "content_category",
			})

			for i := 0; i < expectedCount; i++ {
				rows.AddRow(
					uuid.New().String(),
					userID,
					category,
					TypeSystemUpdate,
					"Test Title",
					"Test Content",
					nil,
					time.Now().Add(-time.Duration(i)*time.Hour),
					nil,
					nil,
					nil,
				)
			}

			// Mock expects limit of 100 (capped)
			mock.ExpectQuery(`SELECT id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category`).
				WithArgs(userID, category, 100, offset).
				WillReturnRows(rows)

			countRows := sqlmock.NewRows([]string{"count"}).AddRow(totalNotifications)
			mock.ExpectQuery(`SELECT COUNT\(\*\)`).
				WithArgs(userID, category).
				WillReturnRows(countRows)

			// Execute with high limit
			result, err := service.GetNotifications(ctx, userID, category, requestedLimit, offset)

			if err != nil {
				t.Logf("Unexpected error: %v", err)
				return false
			}

			// Should return at most 100 notifications
			if len(result.Notifications) > 100 {
				t.Logf("Expected at most 100 notifications with max limit, got %d", len(result.Notifications))
				return false
			}

			if err := mock.ExpectationsWereMet(); err != nil {
				t.Logf("Mock expectations not met: %v", err)
				return false
			}

			return true
		},
		// Generate requested limits above 100
		gen.IntRange(101, 500),
		// Generate total notifications between 0 and 200
		gen.IntRange(0, 200),
	))

	properties.TestingRun(t)
}
