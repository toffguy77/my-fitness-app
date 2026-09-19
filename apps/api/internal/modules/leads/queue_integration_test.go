//go:build integration

// Очередь куратора живёт на реальном порядке базы: подмена (sqlmock) отвечает
// ровно то, что ей сказали ответить, и вопрос «что и в каком порядке вернул
// запрос» на ней задаётся самому себе. Проверяется на живой базе.
package leads

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func daysAgo(n int) time.Time {
	return time.Now().Add(-time.Duration(n) * 24 * time.Hour)
}

// seedCoordinator creates a user with the coordinator role and returns its id,
// so handled_by (a foreign key into users) has something real to point at.
func seedCoordinator(t *testing.T, db *sql.DB, email string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, db.QueryRow(`
		INSERT INTO users (email, password, name, role)
		VALUES ($1, 'x', 'Куратор', 'coordinator')
		RETURNING id`, email,
	).Scan(&id))
	return id
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

// Очередь общая, и двое кураторов могут открыть одну и ту же заявку почти
// одновременно. Цена — один лишний разговор, а не потерянный человек; но
// запись о том, кто взял её первым, перезаписывать нельзя, иначе непонятно,
// кто на самом деле говорил с этим человеком.
func TestMarkHandledKeepsFirstClaim(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "leads_mark_handled")
	svc := newServiceForTest(t, db.DB)
	ctx := context.Background()

	first := seedCoordinator(t, db.DB, "first-coordinator@example.test")
	second := seedCoordinator(t, db.DB, "second-coordinator@example.test")
	id := seedLead(t, db.DB, "contested@example.com", daysAgo(1))

	require.NoError(t, svc.MarkHandled(ctx, id, first))
	err := svc.MarkHandled(ctx, id, second)
	require.Error(t, err, "вторая отметка обязана сообщить, что заявку уже взяли")
	assert.ErrorIs(t, err, apperrors.ErrConflict, "второй куратор должен получить именно конфликт, а не тихий успех")

	var by int64
	require.NoError(t, db.QueryRow(
		`SELECT handled_by FROM leads WHERE id = $1`, id).Scan(&by))
	assert.Equal(t, first, by, "первая отметка не перезаписывается")
}

// Отдельно от предыдущего теста: там вызовы идут по очереди, и порядок
// решает Go, а не база. Здесь оба вызова уходят одновременно — только
// проверка в самом UPDATE (WHERE handled_at IS NULL) может развести двух
// кураторов, не защита на уровне процесса, которой здесь нет и быть не может:
// *sql.DB общий, но это две независимых горутины.
func TestMarkHandledRaceHasExactlyOneWinner(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "leads_mark_race")
	svc := newServiceForTest(t, db.DB)
	ctx := context.Background()

	first := seedCoordinator(t, db.DB, "race-first@example.test")
	second := seedCoordinator(t, db.DB, "race-second@example.test")
	id := seedLead(t, db.DB, "race@example.com", daysAgo(1))

	var wg sync.WaitGroup
	errs := make([]error, 2)
	wg.Add(2)
	go func() {
		defer wg.Done()
		errs[0] = svc.MarkHandled(ctx, id, first)
	}()
	go func() {
		defer wg.Done()
		errs[1] = svc.MarkHandled(ctx, id, second)
	}()
	wg.Wait()

	successes, conflicts := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, apperrors.ErrConflict):
			conflicts++
		default:
			t.Fatalf("неожиданная ошибка гонки: %v", err)
		}
	}
	assert.Equal(t, 1, successes, "ровно один куратор должен выиграть гонку")
	assert.Equal(t, 1, conflicts, "второй обязан получить конфликт, а не тихий успех")

	var by int64
	require.NoError(t, db.QueryRow(
		`SELECT handled_by FROM leads WHERE id = $1`, id).Scan(&by))
	assert.Contains(t, []int64{first, second}, by,
		"записан должен быть ровно один из двух — не оба разом и не никто")
}

// Отдельно от предыдущего: заявка, которую никто ещё не отметил, не должна
// молча проходить проверку «первая отметка сохранилась» — такое утверждение
// на пустом поле истинно вырожденно (handled_by = NULL никогда не равен
// ожидаемому curator id).
func TestMarkHandledUnclaimedLeadHasNoHandler(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "leads_mark_unclaimed")
	id := seedLead(t, db.DB, "untouched@example.com", daysAgo(1))

	var by sql.NullInt64
	require.NoError(t, db.QueryRow(
		`SELECT handled_by FROM leads WHERE id = $1`, id).Scan(&by))
	assert.False(t, by.Valid, "непосещённая заявка не должна иметь handled_by")
}
