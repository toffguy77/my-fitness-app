//go:build integration

package curator_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// notification-targets: уведомления, созданные действиями куратора, несут адрес
// экрана. Проверяется строка в notifications, а не подмена.

func (f feedbackFixture) target(t *testing.T, kind notifications.NotificationType) notifications.Target {
	t.Helper()
	var raw []byte
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`SELECT target FROM notifications WHERE user_id = $1 AND type = $2`, f.client, kind).Scan(&raw))
	var target notifications.Target
	require.NoError(t, json.Unmarshal(raw, &target))
	return target
}

// «Отзыв на недельный отчёт».
func TestFeedbackNotificationTargetsTheReport(t *testing.T) {
	ctx := context.Background()
	f := newFeedbackFixture(t, "curator_target_feedback")

	var reportID string
	require.NoError(t, f.db.QueryRowContext(ctx, `
		INSERT INTO weekly_reports (user_id, curator_id, week_start, week_end, week_number, summary)
		VALUES ($1, $2, '2026-10-05', '2026-10-11', 41, '{}') RETURNING id`,
		f.client, f.curator).Scan(&reportID))
	require.NoError(t, f.service.SubmitFeedback(ctx, f.curator, f.client, reportID, curator.SubmitFeedbackRequest{}))

	assert.Equal(t, notifications.Target{
		Kind: notifications.TargetWeeklyFeedback,
		IDs:  notifications.IDs{"report_id": reportID},
	}, f.target(t, notifications.TypeFeedbackReceived))
}

// «Назначенная задача»: kind task, task_id — id задачи; task_type нужен
// приложению, чтобы не предлагать «Выполнено» тренировке.
func TestTaskNotificationTargetsTheTask(t *testing.T) {
	ctx := context.Background()
	f := newFeedbackFixture(t, "curator_target_task")

	task, err := f.service.CreateTask(ctx, f.curator, f.client, curator.CreateTaskRequest{
		Title: "Пить воду", Type: "habit", Deadline: time.Now().AddDate(0, 0, 3).Format("2006-01-02"), Recurrence: "once",
	})
	require.NoError(t, err)

	target := f.target(t, notifications.TypeTaskAssigned)
	assert.Equal(t, notifications.TargetTask, target.Kind)
	assert.Equal(t, task.ID, target.IDs["task_id"])
	assert.Equal(t, "habit", target.IDs["task_type"])
}

func TestPlanNotificationTargetsThePlan(t *testing.T) {
	ctx := context.Background()
	f := newFeedbackFixture(t, "curator_target_plan")

	start := time.Now()
	plan, err := f.service.CreateWeeklyPlan(ctx, f.curator, f.client, curator.CreateWeeklyPlanRequest{
		Calories: 2000, Protein: 120, Fat: 60, Carbs: 200,
		StartDate: start.Format("2006-01-02"), EndDate: start.AddDate(0, 0, 6).Format("2006-01-02"),
	})
	require.NoError(t, err)

	assert.Equal(t, notifications.Target{
		Kind: notifications.TargetPlan,
		IDs:  notifications.IDs{"plan_id": plan.ID},
	}, f.target(t, notifications.TypePlanUpdated))
}
