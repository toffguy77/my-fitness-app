//go:build integration

package support

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type notedRecipients struct{ ids []int64 }

func (n *notedRecipients) CreateNotification(_ context.Context, note *notifications.Notification) error {
	n.ids = append(n.ids, note.UserID)
	return nil
}
func (n *notedRecipients) LanguageOf(context.Context, int64) string { return "ru" }

func TestEscalationCallsTheClientsCurator(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "routing_curator")
	ctx := context.Background()
	noted := &notedRecipients{}
	service := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	service.operators = noted

	var admin, curator, client int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('админ@e.test','x','А','super_admin') RETURNING id`).Scan(&admin))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('куратор@e.test','x','К','coordinator') RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('клиент@e.test','x','Кл','client') RETURNING id`).Scan(&client))
	_, err := db.ExecContext(ctx, `INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1,$2,'active')`, curator, client)
	require.NoError(t, err)

	service.notifyOperators(ctx, "обращение-1", &client, "ответа нет в документации")

	assert.Equal(t, []int64{curator}, noted.ids, "позвали не куратора клиента")
	assert.NotContains(t, noted.ids, admin, "суперадмина позвали при живом кураторе")
}

// Обращение до регистрации звать некому — значит, суперадминам.
func TestEscalationWithoutAnAccountCallsSuperAdmins(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "routing_anon")
	ctx := context.Background()
	noted := &notedRecipients{}
	service := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	service.operators = noted

	var admin int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('админ@e.test','x','А','super_admin') RETURNING id`).Scan(&admin))

	service.notifyOperators(ctx, "обращение-2", nil, "по просьбе пользователя")

	assert.Equal(t, []int64{admin}, noted.ids)
}

// Клиент без активного куратора — тоже к суперадминам.
func TestClientWithoutACuratorFallsBack(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "routing_nocurator")
	ctx := context.Background()
	noted := &notedRecipients{}
	service := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	service.operators = noted

	var admin, curator, client int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('админ@e.test','x','А','super_admin') RETURNING id`).Scan(&admin))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('бывший@e.test','x','Б','coordinator') RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('клиент@e.test','x','Кл','client') RETURNING id`).Scan(&client))
	// Связь есть, но неактивная: куратор был и перестал.
	_, err := db.ExecContext(ctx, `INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1,$2,'inactive')`, curator, client)
	require.NoError(t, err)

	service.notifyOperators(ctx, "обращение-3", &client, "ответа нет в документации")

	assert.Equal(t, []int64{admin}, noted.ids, "позвали неактивного куратора")
}

// Куратор мог смениться между первым вопросом и передачей человеку.
func TestTheCuratorIsChosenAtEscalationTime(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "routing_swap")
	ctx := context.Background()
	noted := &notedRecipients{}
	service := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	service.operators = noted

	var was, now, client int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('был@e.test','x','Б','coordinator') RETURNING id`).Scan(&was))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('стал@e.test','x','С','coordinator') RETURNING id`).Scan(&now))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('клиент@e.test','x','Кл','client') RETURNING id`).Scan(&client))
	_, err := db.ExecContext(ctx, `INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1,$2,'inactive')`, was, client)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1,$2,'active')`, now, client)
	require.NoError(t, err)

	service.notifyOperators(ctx, "обращение-4", &client, "ответа нет в документации")

	assert.Equal(t, []int64{now}, noted.ids, "позвали прежнего куратора")
}

// Обращение, на которое никто не ответил, поднимается на суперадминов.
//
// Подключением считается отправленный ответ, а не открытая очередь. И
// поднимается один раз: очередь, которая кричит на каждом проходе, перестаёт
// что-либо значить.
func TestUnansweredEscalationIsRaisedOnce(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "routing_raise")
	ctx := context.Background()
	noted := &notedRecipients{}
	service := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	service.operators = noted

	var admin, curator, client int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('админ@e.test','x','А','super_admin') RETURNING id`).Scan(&admin))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('куратор@e.test','x','К','coordinator') RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('клиент@e.test','x','Кл','client') RETURNING id`).Scan(&client))

	var conversationID string
	require.NoError(t, db.QueryRowContext(ctx, `
		INSERT INTO support_conversations (chat_id, user_id, status, escalation_reason, escalated_at)
		VALUES (5001, $1, 'escalated', 'ответа нет в документации', NOW() - INTERVAL '45 minutes')
		RETURNING id`, client).Scan(&conversationID))

	raised, err := service.RaiseUnanswered(ctx, ReescalationAfter)

	require.NoError(t, err)
	assert.Equal(t, 1, raised)
	assert.Equal(t, []int64{admin}, noted.ids, "подняли не на суперадминов")

	// Второй проход молчит.
	noted.ids = nil
	raised, err = service.RaiseUnanswered(ctx, ReescalationAfter)
	require.NoError(t, err)
	assert.Zero(t, raised, "обращение подняли второй раз")
	assert.Empty(t, noted.ids)
}

// Куратор ответил вовремя — поднимать нечего.
func TestAnsweredEscalationIsNotRaised(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "routing_answered")
	ctx := context.Background()
	noted := &notedRecipients{}
	service := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	service.operators = noted

	var client int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('клиент@e.test','x','Кл','client') RETURNING id`).Scan(&client))
	_, err := db.ExecContext(ctx, `
		INSERT INTO support_conversations (chat_id, user_id, status, escalated_at, answered_at)
		VALUES (5002, $1, 'escalated', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '40 minutes')`, client)
	require.NoError(t, err)

	raised, err := service.RaiseUnanswered(ctx, ReescalationAfter)

	require.NoError(t, err)
	assert.Zero(t, raised, "подняли обращение, на которое ответили")
}

// Порог соблюдается: свежее обращение не поднимается.
func TestFreshEscalationWaitsForTheThreshold(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "routing_fresh")
	ctx := context.Background()
	noted := &notedRecipients{}
	service := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	service.operators = noted

	var client int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('клиент@e.test','x','Кл','client') RETURNING id`).Scan(&client))
	_, err := db.ExecContext(ctx, `
		INSERT INTO support_conversations (chat_id, user_id, status, escalated_at)
		VALUES (5003, $1, 'escalated', NOW() - INTERVAL '5 minutes')`, client)
	require.NoError(t, err)

	raised, err := service.RaiseUnanswered(ctx, ReescalationAfter)

	require.NoError(t, err)
	assert.Zero(t, raised, "подняли раньше порога")
}
