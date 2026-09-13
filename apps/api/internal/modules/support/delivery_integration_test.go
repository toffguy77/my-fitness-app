//go:build integration

package support_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/burcev/api/internal/modules/support"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Ответ оператора записывается до попытки отправки — иначе отказ Telegram стоил
// бы человеку набранного текста. Значит, в переписке он есть при любом исходе,
// и единственное, что отличает отправленное от осевшего у нас, — отметка о
// доставке.
//
// Проверяется на настоящей базе намеренно. На sqlmock эта проверка проходила и
// с заплаткой, и без неё: подмена не спотыкается на лишнем запросе, а отметка
// ставится запросом, ошибку которого мы сознательно глотаем. Вопрос «оказалась
// ли отметка в строке» можно задать только строке.

type refusingSender struct{ err error }

func (r *refusingSender) SendMessage(context.Context, int64, string) error { return r.err }

type acceptingSender struct{}

func (acceptingSender) SendMessage(context.Context, int64, string) error { return nil }

func conversationFor(t *testing.T, db interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, chatID int64) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO support_conversations (chat_id, status)
		 VALUES ($1, 'escalated') RETURNING id`, chatID).Scan(&id))
	return id
}

func deliveredOf(t *testing.T, db *sql.DB, conversationID string) (text string, delivered bool) {
	t.Helper()
	var deliveredAt sql.NullTime
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT text, delivered_at FROM support_messages
		 WHERE conversation_id = $1::uuid AND author = 'operator'`,
		conversationID).Scan(&text, &deliveredAt))
	return text, deliveredAt.Valid
}

func TestOperatorReplySurvivesAFailedSendButIsNotMarkedDelivered(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_delivery_fail")
	ctx := context.Background()

	service := support.NewService(db.DB, logger.New(), nil,
		&refusingSender{err: errors.New("telegram returned 401: unauthorized")}, nil, 100)
	conversationID := conversationFor(t, db, 810001)

	err := service.AnswerAsOperator(ctx, conversationID, 1, "ответ, который не дошёл")

	require.Error(t, err, "отказ отправки обязан дойти до оператора, а не утонуть")

	text, delivered := deliveredOf(t, db.DB, conversationID)
	assert.Equal(t, "ответ, который не дошёл", text,
		"текст оператора не должен пропадать из-за отказа Telegram")
	assert.False(t, delivered,
		"неотправленное не должно выглядеть отправленным: следующий оператор "+
			"решит, что человеку ответили")
}

func TestOperatorReplyIsMarkedDeliveredWhenTelegramAccepts(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_delivery_ok")
	ctx := context.Background()

	service := support.NewService(db.DB, logger.New(), nil, acceptingSender{}, nil, 100)
	conversationID := conversationFor(t, db, 810002)

	require.NoError(t, service.AnswerAsOperator(ctx, conversationID, 1, "ответ, который дошёл"))

	_, delivered := deliveredOf(t, db.DB, conversationID)
	assert.True(t, delivered, "без отметки на доставленном поле не значит ничего")
}
