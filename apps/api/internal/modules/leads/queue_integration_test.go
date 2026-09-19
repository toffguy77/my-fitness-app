//go:build integration

// Очередь куратора живёт на реальном порядке базы: подмена (sqlmock) отвечает
// ровно то, что ей сказали ответить, и вопрос «что и в каком порядке вернул
// запрос» на ней задаётся самому себе. Проверяется на живой базе.
package leads

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func daysAgo(n int) time.Time {
	return time.Now().Add(-time.Duration(n) * 24 * time.Hour)
}

func newServiceForTest(t *testing.T, db *sql.DB) *Service {
	t.Helper()
	return NewService(db, logger.New(), "queue-test-secret")
}

func seedLead(t *testing.T, db *sql.DB, email string, createdAt time.Time) string {
	t.Helper()
	return seedLeadAt(t, db, email, "contact", createdAt, true)
}

func seedLeadAt(t *testing.T, db *sql.DB, email, lastStep string, createdAt time.Time, contactConsent bool) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRow(`
		INSERT INTO leads (email, last_step, source, data_consent, contact_consent, created_at, updated_at)
		VALUES ($1, $2, 'landing', true, $3, $4, $4)
		RETURNING id`,
		email, lastStep, contactConsent, createdAt,
	).Scan(&id))
	return id
}

func markHandled(t *testing.T, db *sql.DB, leadID string) {
	t.Helper()
	_, err := db.Exec(`UPDATE leads SET handled_at = NOW() WHERE id = $1`, leadID)
	require.NoError(t, err)
}

func markReminded(t *testing.T, db *sql.DB, leadID string) {
	t.Helper()
	_, err := db.Exec(`UPDATE leads SET reminder_sent_at = NOW() WHERE id = $1`, leadID)
	require.NoError(t, err)
}

// seedWebConversationForLead links a support conversation to a lead the way
// migration 052 allows today. chat_id stays NOT NULL UNIQUE until the
// public-support-widget plan changes it; the negative, time-derived value
// here is only to avoid colliding with a real Telegram chat id.
func seedWebConversationForLead(t *testing.T, db *sql.DB, leadID string) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRow(`
		INSERT INTO support_conversations (chat_id, lead_id, status)
		VALUES ($1, $2, 'open')
		RETURNING id`,
		-time.Now().UnixNano(), leadID,
	).Scan(&id))
	return id
}

// Очередь, а не таблица: сверху то, что ждёт дольше всех, и только то, чем
// ещё никто не занялся.
func TestQueueShowsUnhandledOldestFirst(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "leads_queue_order")
	svc := newServiceForTest(t, db.DB)

	old := seedLead(t, db.DB, "old@example.com", daysAgo(10))
	recent := seedLead(t, db.DB, "recent@example.com", daysAgo(1))
	done := seedLead(t, db.DB, "done@example.com", daysAgo(5))
	markHandled(t, db.DB, done)

	entries, total, err := svc.Queue(context.Background(), false, 20, 0)
	require.NoError(t, err)

	// Проверяется отдельно от порядка: пустая выборка не должна тихо
	// удовлетворять проверку порядка ниже.
	require.Len(t, entries, 2, "в очереди должны остаться только необработанные")
	assert.Equal(t, 2, total)
	assert.Equal(t, old, entries[0].ID, "дольше всех ждёт — первым")
	assert.Equal(t, recent, entries[1].ID)

	withHandled, totalHandled, err := svc.Queue(context.Background(), true, 20, 0)
	require.NoError(t, err)
	assert.Len(t, withHandled, 3)
	assert.Equal(t, 3, totalHandled)
}

// Список почт — это не инструмент, а повод для рассылки. Куратор должен
// открыть заявку и понимать, что сказать этому человеку.
func TestQueueEntryCarriesGroundsForConversation(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "leads_queue_entry")
	svc := newServiceForTest(t, db.DB)

	id := seedLeadAt(t, db.DB, "stuck@example.com", "result", daysAgo(3), true)
	markReminded(t, db.DB, id)
	conversationID := seedWebConversationForLead(t, db.DB, id)

	entries, _, err := svc.Queue(context.Background(), false, 20, 0)
	require.NoError(t, err)
	require.Len(t, entries, 1)

	e := entries[0]
	assert.Equal(t, "result", e.LastStep)
	assert.Equal(t, 3, e.AgeDays)
	assert.True(t, e.ReminderSent)
	assert.True(t, e.ContactAllowed)
	require.NotNil(t, e.ConversationID)
	assert.Equal(t, conversationID, *e.ConversationID)
}

func TestQueueEntryWithoutConsentIsMarked(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "leads_queue_consent")
	svc := newServiceForTest(t, db.DB)

	seedLeadAt(t, db.DB, "nocontact@example.com", "contact", daysAgo(2), false)

	entries, _, err := svc.Queue(context.Background(), false, 20, 0)
	require.NoError(t, err)
	require.Len(t, entries, 1)

	// Заявка видна — она говорит о потоке. Но писать ей нельзя, и это должно
	// быть свойством данных, а не памятью куратора.
	assert.False(t, entries[0].ContactAllowed)
}

// Зависимость от плана public-support-widget: массовое заполнение
// conversation_id придёт вместе с ним. До тех пор у большинства заявок
// разговора с ботом просто нет, и это не должно превращаться в ссылку в
// никуда — переход в переписку не предлагается вовсе.
func TestQueueEntryWithoutConversationOffersNoTransition(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "leads_queue_noconv")
	svc := newServiceForTest(t, db.DB)

	seedLeadAt(t, db.DB, "alone@example.com", "contact", daysAgo(1), true)

	entries, _, err := svc.Queue(context.Background(), false, 20, 0)
	require.NoError(t, err)
	require.Len(t, entries, 1)

	assert.Nil(t, entries[0].ConversationID, "без разговора переход в него не должен предлагаться")
}
