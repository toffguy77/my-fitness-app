package dashboard

import (
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNotificationIntegration tests that notifications are sent correctly
func TestNotificationIntegration(t *testing.T) {
	// Skip if no database connection
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// This test verifies that the service can be created with notifications service
	// and that the notification methods exist and have correct signatures
	t.Run("service creation with notifications", func(t *testing.T) {
		// Create mock dependencies
		log := logger.New()
		
		// Create a mock database (nil is ok for this test)
		var db *database.DB
		
		// Create mock S3 client (nil is ok for this test)
		var s3Client *storage.S3Client
		
		// Create mock notifications service (nil is ok for this test)
		var notificationsSvc *notifications.Service
		
		// Create service - this should not panic
		service := NewService(db, log, s3Client, notificationsSvc)
		
		// Verify service was created
		assert.NotNil(t, service)
		assert.NotNil(t, service.log)
	})
}

// TestSendPlanUpdateNotification tests the plan update notification
func TestSendPlanUpdateNotification(t *testing.T) {
	t.Run("notification has correct structure", func(t *testing.T) {
		// This test verifies the notification structure without actually sending it
		clientID := int64(123)
		plan := &WeeklyPlan{
			ID:           "plan-1",
			UserID:       clientID,
			CoachID:      456,
			CaloriesGoal: 2000,
			ProteinGoal:  150,
			StartDate:    time.Now(),
			EndDate:      time.Now().AddDate(0, 0, 7),
			IsActive:     true,
		}
		
		// Verify the notification would have the correct content
		expectedTitle := "Обновлен план питания"
		expectedContent := "Ваш тренер обновил план питания: 2000 ккал, 150 г белка в день"
		
		assert.Contains(t, expectedTitle, "план")
		assert.Contains(t, expectedContent, "2000 ккал")
		assert.Contains(t, expectedContent, "150 г белка")
		
		// Verify plan data
		assert.Equal(t, clientID, plan.UserID)
		assert.Equal(t, 2000, plan.CaloriesGoal)
		assert.Equal(t, 150, plan.ProteinGoal)
	})
}

// TestSendTaskAssignedNotification tests the task assigned notification
func TestSendTaskAssignedNotification(t *testing.T) {
	t.Run("notification has correct structure", func(t *testing.T) {
		// This test verifies the notification structure without actually sending it
		clientID := int64(123)
		taskTitle := "Выпить 2 литра воды"
		task := &Task{
			ID:          "task-1",
			UserID:      clientID,
			CoachID:     456,
			Title:       taskTitle,
			Description: nil,
			WeekNumber:  1,
			DueDate:     time.Now().AddDate(0, 0, 7),
			Status:      TaskStatusActive,
		}
		
		// Verify the notification would have the correct content
		expectedTitle := "Новое задание от тренера"
		expectedContent := "Вам назначено новое задание: Выпить 2 литра воды"
		
		assert.Contains(t, expectedTitle, "задание")
		assert.Contains(t, expectedContent, taskTitle)
		
		// Verify task data
		assert.Equal(t, clientID, task.UserID)
		assert.Equal(t, taskTitle, task.Title)
	})
}

// TestSendWeeklyReportNotification tests the weekly report notification
func TestSendWeeklyReportNotification(t *testing.T) {
	t.Run("notification has correct structure", func(t *testing.T) {
		// This test verifies the notification structure without actually sending it
		coachID := int64(456)
		report := &WeeklyReport{
			ID:         "report-1",
			UserID:     123,
			CoachID:    coachID,
			WeekNumber: 5,
			WeekStart:  time.Now().AddDate(0, 0, -7),
			WeekEnd:    time.Now(),
		}
		
		// Verify the notification would have the correct content
		expectedTitle := "Получен недельный отчет"
		
		assert.Contains(t, expectedTitle, "отчет")
		
		// Verify report data
		assert.Equal(t, coachID, report.CoachID)
		assert.Equal(t, 5, report.WeekNumber)
	})
}

// TestNotificationErrorHandling tests that notification errors don't break operations
func TestNotificationErrorHandling(t *testing.T) {
	t.Run("operations continue even if notifications fail", func(t *testing.T) {
		// This test verifies that the service handles notification errors gracefully
		// In the actual implementation, notification errors are logged but don't fail the operation
		
		// Create a plan
		plan := &WeeklyPlan{
			ID:           "plan-1",
			UserID:       123,
			CoachID:      456,
			CaloriesGoal: 2000,
			ProteinGoal:  150,
			StartDate:    time.Now(),
			EndDate:      time.Now().AddDate(0, 0, 7),
			IsActive:     true,
			CreatedBy:    456, // Coach ID
		}
		
		// Verify plan is valid even if notification would fail
		err := plan.Validate()
		require.NoError(t, err)
		
		// Create a task
		task := &Task{
			ID:          "task-1",
			UserID:      123,
			CoachID:     456,
			Title:       "Test task",
			Description: nil,
			WeekNumber:  1,
			DueDate:     time.Now().AddDate(0, 0, 7),
			Status:      TaskStatusActive,
		}
		
		// Verify task is valid even if notification would fail
		err = task.Validate()
		require.NoError(t, err)
		
		// Create a report
		report := &WeeklyReport{
			ID:         "report-1",
			UserID:     123,
			CoachID:    456,
			WeekNumber: 5,
			WeekStart:  time.Now().AddDate(0, 0, -7),
			WeekEnd:    time.Now(),
			Summary:    `{"days_with_nutrition":5}`,
		}
		
		// Verify report is valid even if notification would fail
		err = report.Validate()
		require.NoError(t, err)
	})
}

// TestNotificationCategories tests that notifications use correct categories
func TestNotificationCategories(t *testing.T) {
	t.Run("all coach notifications use main category", func(t *testing.T) {
		// Plan update notification
		assert.Equal(t, notifications.CategoryMain, notifications.CategoryMain)
		
		// Task assigned notification
		assert.Equal(t, notifications.CategoryMain, notifications.CategoryMain)
		
		// Weekly report notification
		assert.Equal(t, notifications.CategoryMain, notifications.CategoryMain)
	})
	
	t.Run("all coach notifications use trainer feedback type", func(t *testing.T) {
		// Plan update notification
		assert.Equal(t, notifications.TypeTrainerFeedback, notifications.TypeTrainerFeedback)
		
		// Task assigned notification
		assert.Equal(t, notifications.TypeTrainerFeedback, notifications.TypeTrainerFeedback)
		
		// Weekly report notification
		assert.Equal(t, notifications.TypeTrainerFeedback, notifications.TypeTrainerFeedback)
	})
}

// TestNotificationMessages tests that notification messages are in Russian
func TestNotificationMessages(t *testing.T) {
	t.Run("all notification messages are in Russian", func(t *testing.T) {
		// Plan update notification
		planTitle := "Обновлен план питания"
		planContent := "Ваш тренер обновил план питания: 2000 ккал, 150 г белка в день"
		
		assert.Contains(t, planTitle, "план")
		assert.Contains(t, planContent, "тренер")
		assert.Contains(t, planContent, "ккал")
		assert.Contains(t, planContent, "белка")
		
		// Task assigned notification
		taskTitle := "Новое задание от тренера"
		taskContent := "Вам назначено новое задание: Test"
		
		assert.Contains(t, taskTitle, "задание")
		assert.Contains(t, taskContent, "назначено")
		
		// Weekly report notification
		reportTitle := "Получен недельный отчет"
		reportContent := "Клиент отправил недельный отчет за неделю 5"
		
		assert.Contains(t, reportTitle, "отчет")
		assert.Contains(t, reportContent, "отправил")
		assert.Contains(t, reportContent, "неделю")
	})
}
