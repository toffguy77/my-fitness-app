//go:build integration

package curator_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/burcev/api/migrations"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Уведомление об отзыве куратора вело на /dashboard/weekly-reports/<id>/feedback
// — адрес, по которому страницы нет. Отзыв показывает дашборд по ?report=<id>.
//
// На настоящей базе: ссылка проверяется по строке в notifications, а не по
// подмене, которая согласилась бы с любым адресом.

type feedbackFixture struct {
	db      *database.DB
	service *curator.Service
	curator int64
	client  int64
}

func newFeedbackFixture(t *testing.T, name string) feedbackFixture {
	t.Helper()
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, name)
	log := logger.New()

	f := feedbackFixture{db: db, service: curator.NewService(db, log, notifications.NewService(db, log))}
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&f.curator))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('client@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&f.client))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status, access_expires_at)
		 VALUES ($1, $2, 'active', NULL)`, f.curator, f.client)
	require.NoError(t, err)
	return f
}

func (f feedbackFixture) actionURLs(t *testing.T, kind string) []string {
	t.Helper()
	rows, err := f.db.QueryContext(context.Background(),
		`SELECT COALESCE(action_url, '') FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY id`,
		f.client, kind)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()
	var urls []string
	for rows.Next() {
		var u string
		require.NoError(t, rows.Scan(&u))
		urls = append(urls, u)
	}
	require.NoError(t, rows.Err())
	return urls
}

func TestSubmitFeedback_NotificationLeadsToTheDashboard(t *testing.T) {
	ctx := context.Background()
	f := newFeedbackFixture(t, "curator_feedback_url")

	var reportID string
	require.NoError(t, f.db.QueryRowContext(ctx, `
		INSERT INTO weekly_reports (user_id, curator_id, week_start, week_end, week_number, summary)
		VALUES ($1, $2, '2026-10-05', '2026-10-11', 41, '{}') RETURNING id`,
		f.client, f.curator).Scan(&reportID))

	require.NoError(t, f.service.SubmitFeedback(ctx, f.curator, f.client, reportID,
		curator.SubmitFeedbackRequest{}))

	urls := f.actionURLs(t, string(notifications.TypeFeedbackReceived))
	require.Len(t, urls, 1, "клиент не получил уведомления об отзыве")
	assert.Equal(t, "/dashboard?report="+reportID, urls[0])
	assert.NotContains(t, urls[0], "/weekly-reports/",
		"страницы /dashboard/weekly-reports/<id>/feedback нет — ссылка вела в 404")
}

// Уже выданные уведомления переписывает миграция 097: человек, открывший старое
// уведомление после выкатки, иначе всё равно попал бы в 404.
func TestMigration097_RewritesOldFeedbackLinks(t *testing.T) {
	ctx := context.Background()
	f := newFeedbackFixture(t, "curator_feedback_migration")

	up, err := migrations.FS.ReadFile("097_feedback_action_url_up.sql")
	require.NoError(t, err)
	down, err := migrations.FS.ReadFile("097_feedback_action_url_down.sql")
	require.NoError(t, err)

	const reportID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f"
	insert := func(kind, url string) {
		t.Helper()
		_, err := f.db.ExecContext(ctx, `
			INSERT INTO notifications (user_id, category, type, title, content, action_url)
			VALUES ($1, 'main', $2, 'Заголовок', 'Текст', $3)`, f.client, kind, url)
		require.NoError(t, err)
	}
	insert(string(notifications.TypeFeedbackReceived), "/dashboard/weekly-reports/"+reportID+"/feedback")
	// Чужие ссылки миграция не трогает.
	insert(string(notifications.TypeTaskAssigned), "/dashboard?tab=tasks")

	_, err = f.db.ExecContext(ctx, string(up))
	require.NoError(t, err)

	assert.Equal(t, []string{"/dashboard?report=" + reportID},
		f.actionURLs(t, string(notifications.TypeFeedbackReceived)))
	assert.Equal(t, []string{"/dashboard?tab=tasks"},
		f.actionURLs(t, string(notifications.TypeTaskAssigned)))

	// Повторный прогон ничего не портит.
	_, err = f.db.ExecContext(ctx, string(up))
	require.NoError(t, err)
	assert.Equal(t, []string{"/dashboard?report=" + reportID},
		f.actionURLs(t, string(notifications.TypeFeedbackReceived)))

	// Откат возвращает прежний вид и только у уведомлений об отзыве.
	_, err = f.db.ExecContext(ctx, string(down))
	require.NoError(t, err)
	assert.Equal(t, []string{"/dashboard/weekly-reports/" + reportID + "/feedback"},
		f.actionURLs(t, string(notifications.TypeFeedbackReceived)))
	assert.Equal(t, []string{"/dashboard?tab=tasks"},
		f.actionURLs(t, string(notifications.TypeTaskAssigned)))
}
