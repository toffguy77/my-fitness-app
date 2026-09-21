//go:build integration

// Проверяется на живой базе намеренно: подмена помнит ровно то, что ей
// велели вернуть, и не отличит код, который действительно пишет автора
// ответа и того, кто закрыл разговор, в operator_id/closed_by, от кода,
// который эти столбцы не трогает вовсе — как sqlmock уже пропускал запрос к
// несуществующей колонке в другом месте этого проекта. Задача 4 не разрешила
// повторной отметке об обработке заявки (2.4) перезаписывать первую как раз
// ради этого следа: кто говорил с человеком и кто закрыл обращение.
package support

import (
	"context"
	"database/sql"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// insertCoordinator и insertTelegramConversation живут в этом файле, а не
// переиспользуют похожие вставки из routing_integration_test.go и
// attachment_integration_test.go, потому что там роль и статус разговора
// другие — сведение в общий хелпер стоило бы больше, чем два скалярных INSERT.
func insertCoordinator(t *testing.T, db *database.DB, email string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', 'Куратор', 'coordinator') RETURNING id`,
		email).Scan(&id))
	return id
}

func insertTelegramConversation(t *testing.T, db *database.DB, chatID int64) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO support_conversations (chat_id, status) VALUES ($1, 'escalated') RETURNING id`,
		chatID).Scan(&id))
	return id
}

// Два куратора и два разговора, а не один куратор и один разговор:
// утверждение "operator_id у ответа не NULL" истинно и для кода, который
// вписывает туда id первого попавшегося пользователя или чужую константу —
// это и была бы та самая вырожденная проверка. Только соответствие именно
// "своему" разговору у каждого куратора доказывает, что записан настоящий,
// а не произвольный автор.
func TestAnswerAsOperatorRecordsWhichCuratorAnswered(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_answer_author")
	ctx := context.Background()
	svc := NewService(db.DB, logger.New(), nil, &noopSender{}, nil, 100)

	first := insertCoordinator(t, db, "куратор-один@e.test")
	second := insertCoordinator(t, db, "куратор-два@e.test")

	firstConv := insertTelegramConversation(t, db, 88101)
	secondConv := insertTelegramConversation(t, db, 88102)

	require.NoError(t, svc.AnswerAsOperator(ctx, firstConv, first, "ответ первого куратора"))
	require.NoError(t, svc.AnswerAsOperator(ctx, secondConv, second, "ответ второго куратора"))

	var firstAuthor, secondAuthor sql.NullInt64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT operator_id FROM support_messages WHERE conversation_id = $1::uuid AND author = 'operator'`,
		firstConv).Scan(&firstAuthor))
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT operator_id FROM support_messages WHERE conversation_id = $1::uuid AND author = 'operator'`,
		secondConv).Scan(&secondAuthor))

	require.True(t, firstAuthor.Valid, "автор первого ответа не записан")
	require.True(t, secondAuthor.Valid, "автор второго ответа не записан")
	assert.Equal(t, first, firstAuthor.Int64, "первый ответ записан не тем автором")
	assert.Equal(t, second, secondAuthor.Int64, "второй ответ записан не тем автором")
	assert.NotEqual(t, firstAuthor.Int64, secondAuthor.Int64,
		"оба ответа записаны одним и тем же автором — авторство не различается по разговору")
}

// Та же логика для закрытия: два куратора закрывают два разных разговора, и
// у каждого обязан остаться именно свой закрывший, а не константа и не id
// первого пользователя в таблице.
func TestCloseRecordsWhichCuratorClosedAndWhen(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_close_author")
	ctx := context.Background()
	svc := NewService(db.DB, logger.New(), nil, &noopSender{}, nil, 100)

	first := insertCoordinator(t, db, "закрыл-один@e.test")
	second := insertCoordinator(t, db, "закрыл-два@e.test")

	firstConv := insertTelegramConversation(t, db, 89101)
	secondConv := insertTelegramConversation(t, db, 89102)

	require.NoError(t, svc.Close(ctx, firstConv, first))
	require.NoError(t, svc.Close(ctx, secondConv, second))

	var firstClosedBy, secondClosedBy sql.NullInt64
	var firstClosedAt, secondClosedAt sql.NullTime
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT closed_by, closed_at FROM support_conversations WHERE id = $1::uuid`,
		firstConv).Scan(&firstClosedBy, &firstClosedAt))
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT closed_by, closed_at FROM support_conversations WHERE id = $1::uuid`,
		secondConv).Scan(&secondClosedBy, &secondClosedAt))

	require.True(t, firstClosedBy.Valid, "закрывший первый разговор не записан")
	require.True(t, secondClosedBy.Valid, "закрывший второй разговор не записан")
	assert.Equal(t, first, firstClosedBy.Int64, "первый разговор закрыт не тем куратором")
	assert.Equal(t, second, secondClosedBy.Int64, "второй разговор закрыт не тем куратором")
	assert.NotEqual(t, firstClosedBy.Int64, secondClosedBy.Int64,
		"оба разговора закрыты одним и тем же куратором — закрывший не различается по разговору")
	assert.True(t, firstClosedAt.Valid, "время закрытия первого разговора не записано")
	assert.True(t, secondClosedAt.Valid, "время закрытия второго разговора не записано")
}
