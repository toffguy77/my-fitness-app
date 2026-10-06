//go:build integration

package leads_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Заявка на куратора пролежала в очереди неделю: о ней не сказали никому.
// Эти тесты держат обратное — о заявке узнают сразу, а о забытой напомнят.

type groupSpy struct {
	mu   sync.Mutex
	sent []string
}

func (g *groupSpy) Announce(_ context.Context, text string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.sent = append(g.sent, text)
	return nil
}

func (g *groupSpy) messages() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]string(nil), g.sent...)
}

// alertingService собирает сервис с настоящими уведомлениями: подменённые
// пропустили бы ограничение на тип в базе, ради которого всё и проверяется.
func alertingService(t *testing.T, prefix string) (*database.DB, *leads.Service, *groupSpy) {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, prefix)
	log := logger.New()
	group := &groupSpy{}
	service := leads.NewService(db.DB, log, "test-secret").
		WithOperatorAlerts(notifications.NewService(db, log), group, "https://app.test")
	return db, service, group
}

func seedUser(t *testing.T, db *database.DB, email, role string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ($1, 'x', 'Имя', $2, true) RETURNING id`, email, role).Scan(&id))
	return id
}

func notificationsOf(t *testing.T, db *database.DB, userID int64) int {
	t.Helper()
	var n int
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'curator_requested'`,
		userID).Scan(&n))
	return n
}

func TestCuratorRequest_ЗовётГруппуИСуперадминов(t *testing.T) {
	ctx := context.Background()
	db, service, group := alertingService(t, "alert_on_request")
	admin := seedUser(t, db, "boss@example.test", "super_admin")
	client := seedUser(t, db, "client@example.test", "client")

	_, err := service.CreateCuratorRequest(ctx, client, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)

	sent := group.messages()
	require.Len(t, sent, 1, "о заявке должна узнать группа кураторов")
	assert.Contains(t, sent[0], "client@example.test")
	assert.Contains(t, sent[0], "предложение куратора в чате")
	assert.Contains(t, sent[0], "https://app.test/curator/leads")
	assert.Equal(t, 1, notificationsOf(t, db, admin), "и суперадмин — уведомлением")
}

func TestCuratorRequest_ПовторноеНажатиеНеНовость(t *testing.T) {
	ctx := context.Background()
	db, service, group := alertingService(t, "alert_repeat")
	admin := seedUser(t, db, "boss@example.test", "super_admin")
	client := seedUser(t, db, "client@example.test", "client")

	_, err := service.CreateCuratorRequest(ctx, client, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)
	_, err = service.CreateCuratorRequest(ctx, client, leads.CaptureCuratorOfferDashboard)
	require.NoError(t, err)

	assert.Len(t, group.messages(), 1)
	assert.Equal(t, 1, notificationsOf(t, db, admin))
}

// Гостевая анкета, ставшая просьбой о кураторе, — новость, хотя строка старая.
func TestCuratorRequest_АнкетаСтавшаяЗаявкойЗовёт(t *testing.T) {
	ctx := context.Background()
	db, service, group := alertingService(t, "alert_lead_becomes_request")
	client := seedUser(t, db, "client@example.test", "client")
	_, err := db.ExecContext(ctx, `
		INSERT INTO leads (email, last_step, source, data_consent, contact_consent)
		VALUES ('client@example.test', 'contact', 'landing', true, true)`)
	require.NoError(t, err)

	_, err = service.CreateCuratorRequest(ctx, client, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)

	assert.Len(t, group.messages(), 1)
}

func TestCuratorRequest_ГостьСоСтраницыТарифовЗовёт(t *testing.T) {
	ctx := context.Background()
	_, service, group := alertingService(t, "alert_pricing_guest")

	_, _, err := service.Create(ctx, leads.CreateInput{
		Email:         "guest@example.test",
		LastStep:      "pricing",
		Source:        "pricing",
		CaptureSource: leads.CapturePricingPage,
		Consents:      leads.Consents{DataProcessing: true, Contact: true},
	}, "127.0.0.1", "test")
	require.NoError(t, err)

	sent := group.messages()
	require.Len(t, sent, 1)
	assert.Contains(t, sent[0], "guest@example.test")
	assert.Contains(t, sent[0], "ещё не зарегистрирован")
	assert.Contains(t, sent[0], "страница тарифов")
}

func TestCuratorRequest_ОбычнаяАнкетаНикогоНеЗовёт(t *testing.T) {
	ctx := context.Background()
	_, service, group := alertingService(t, "alert_plain_lead")

	_, _, err := service.Create(ctx, leads.CreateInput{
		Email:    "guest@example.test",
		LastStep: "contact",
		Consents: leads.Consents{DataProcessing: true, Contact: true},
	}, "127.0.0.1", "test")
	require.NoError(t, err)

	assert.Empty(t, group.messages())
}

func TestRaiseUnhandledCuratorRequests_НапоминаетОдинРаз(t *testing.T) {
	ctx := context.Background()
	db, service, group := alertingService(t, "alert_raise")
	admin := seedUser(t, db, "boss@example.test", "super_admin")
	client := seedUser(t, db, "client@example.test", "client")

	forgotten, err := service.CreateCuratorRequest(ctx, client, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)
	handled, err := service.CreateCuratorRequest(ctx,
		seedUser(t, db, "handled@example.test", "client"), leads.CaptureCuratorOfferChat)
	require.NoError(t, err)
	_, err = service.CreateCuratorRequest(ctx,
		seedUser(t, db, "fresh@example.test", "client"), leads.CaptureCuratorOfferChat)
	require.NoError(t, err)

	_, err = db.ExecContext(ctx,
		`UPDATE leads SET curator_requested_at = now() - interval '5 hours' WHERE id IN ($1, $2)`,
		forgotten.ID, handled.ID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `UPDATE leads SET handled_at = now() WHERE id = $1`, handled.ID)
	require.NoError(t, err)
	before := len(group.messages())

	raised, err := service.RaiseUnhandledCuratorRequests(ctx, 4*time.Hour)
	require.NoError(t, err)
	assert.Equal(t, 1, raised, "только забытая: взятая и свежая не в счёт")

	sent := group.messages()[before:]
	require.Len(t, sent, 1)
	assert.Contains(t, sent[0], "никто не взял за 5 ч")
	assert.Contains(t, sent[0], "client@example.test")
	assert.Equal(t, 4, notificationsOf(t, db, admin), "три заявки и одно напоминание")

	again, err := service.RaiseUnhandledCuratorRequests(ctx, 4*time.Hour)
	require.NoError(t, err)
	assert.Zero(t, again, "очередь, которая кричит на каждом проходе, перестаёт что-либо значить")
}

// Просившему куратора уходило «ваш расчёт КБЖУ сохранён» — письмо гостю,
// бросившему анкету.
func TestDueReminders_ЗаявкеНаКуратораНеПишут(t *testing.T) {
	ctx := context.Background()
	db, service, _ := alertingService(t, "alert_no_reminder")
	client := seedUser(t, db, "client@example.test", "client")

	request, err := service.CreateCuratorRequest(ctx, client, leads.CaptureCuratorOfferChat)
	require.NoError(t, err)
	var guestID string
	require.NoError(t, db.QueryRowContext(ctx, `
		INSERT INTO leads (email, last_step, source, data_consent, contact_consent)
		VALUES ('guest@example.test', 'contact', 'landing', true, true) RETURNING id`).Scan(&guestID))
	_, err = db.ExecContext(ctx,
		`UPDATE leads SET created_at = now() - interval '2 days'`)
	require.NoError(t, err)

	due, err := service.DueReminders(ctx)
	require.NoError(t, err)

	ids := make([]string, 0, len(due))
	for _, l := range due {
		ids = append(ids, l.ID)
	}
	assert.Contains(t, ids, guestID, "гостю, бросившему анкету, напоминание по-прежнему уходит")
	assert.NotContains(t, ids, request.ID)
}
