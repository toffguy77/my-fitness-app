//go:build integration

package dashboard

import (
	"context"
	"strconv"
	"testing"

	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// notification-targets для уведомлений, которые создаёт дашборд: отчёт
// куратору, задача и план клиенту. На настоящей базе — строка notifications.
func TestDashboardNotificationsCarryTargets(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "dashboard_targets")
	log := logger.New()
	service := NewService(db, log, nil, notifications.NewService(db, log))

	user := func(email, role string) int64 {
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', 'И', $2) RETURNING id`, email, role).Scan(&id))
		return id
	}
	curatorID, clientID := user("cur@example.test", "coordinator"), user("cli@example.test", "client")

	target := func(userID int64, kind notifications.NotificationType) string {
		var raw string
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT target::text FROM notifications WHERE user_id = $1 AND type = $2`, userID, kind).Scan(&raw))
		return raw
	}

	require.NoError(t, service.sendWeeklyReportNotification(ctx, curatorID,
		&WeeklyReport{ID: "r-1", UserID: clientID, CuratorID: curatorID, WeekNumber: 3}))
	assert.JSONEq(t, `{"kind":"weekly_feedback","ids":{"report_id":"r-1","client_id":"`+strconv.FormatInt(clientID, 10)+`"}}`,
		target(curatorID, notifications.TypeTrainerFeedback))

	require.NoError(t, service.sendTaskAssignedNotification(ctx, clientID, &Task{ID: "t-1", Title: "Шаги", Type: "workout"}))
	assert.JSONEq(t, `{"kind":"task","ids":{"task_id":"t-1","task_type":"workout"}}`,
		target(clientID, notifications.TypeTaskAssigned))

	require.NoError(t, service.sendPlanUpdateNotification(ctx, clientID, &WeeklyPlan{ID: "p-1", CaloriesGoal: 2000}))
	assert.JSONEq(t, `{"kind":"plan","ids":{"plan_id":"p-1"}}`, target(clientID, notifications.TypePlanUpdated))
}
