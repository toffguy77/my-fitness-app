//go:build integration

// Проверяется на живой базе намеренно: ListConversations раньше не выбирала
// channel вовсе — на sqlmock подмена вернула бы Channel ровно тем значением,
// каким её попросили бы, и разница между "разговор попал в очередь" и
// "попал, но с потерянным полем" была бы не видна.
package support

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Очередь у оператора одна. Разговор из браузера обязан попасть в неё
// наравне с телеграмным — иначе виджет становится вторым ботом со своей
// очередью, и они разъедутся.
func TestWebEscalationJoinsSameQueue(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "web_escalation_queue")
	ctx := context.Background()
	svc := NewService(db.DB, logger.New(), nil, nil, nil, 100)

	_, webToken, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)
	require.NoError(t, svc.EscalateWeb(ctx, webToken))

	seedEscalatedTelegramConversation(t, db, 555)

	queue, total, err := svc.ListConversations(ctx, "escalated", 10, 0)
	require.NoError(t, err)

	// Вырожденная проверка: на пустой очереди assert.Equal(2, 0) и
	// require.Len(queue, 2) уже провалились бы сами по себе — оба обращения
	// в этом тесте обязаны реально попасть в базу, а не просто не мешать
	// друг другу.
	assert.Equal(t, 2, total)
	require.Len(t, queue, 2)

	channels := []string{queue[0].Channel, queue[1].Channel}
	assert.Contains(t, channels, ChannelWeb)
	assert.Contains(t, channels, ChannelTelegram)
}

// seedEscalatedTelegramConversation заводит уже эскалированный телеграмный
// разговор напрямую в базе — так же, как выглядела бы запись после реальной
// эскалации, без прогона всего HandleMessage ради одной строки.
func seedEscalatedTelegramConversation(t *testing.T, db *database.DB, chatID int64) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO support_conversations (chat_id, channel, status, escalated_at)
		VALUES ($1, 'telegram', 'escalated', NOW())`, chatID)
	require.NoError(t, err)
}
