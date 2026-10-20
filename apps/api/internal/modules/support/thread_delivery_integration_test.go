//go:build integration

package support_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/support"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/migrations"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Что оператор видит о доставке в треде — на настоящей базе.
//
// Признак «Не доставлено в Telegram» под ответом означает ровно одно: Telegram
// отказал. Под ответом веб-посетителю и под ответом, записанным до того, как
// доставку начали отмечать, он был бы неправдой, а «Повторить» под ним — вторым
// сообщением человеку.

func threadDelivered(t *testing.T, messages []support.Message, id string) *bool {
	t.Helper()
	for _, m := range messages {
		if m.ID == id {
			return m.Delivered
		}
	}
	t.Fatalf("message %s not in thread", id)
	return nil
}

func TestThread_DeliveryIsReportedOnlyWhereItWasTracked(t *testing.T) {
	f := newRetryFixture(t, "support_thread_delivery", nil)
	service := support.NewService(f.db, logger.New(), nil, f.sender, nil, 100)
	ctx := context.Background()

	t.Run("Telegram: отказ виден, доставка видна, входящее без признака", func(t *testing.T) {
		conv := f.telegramConversation(t, 7001)
		incoming := f.message(t, conv, "user", "вопрос", false)
		refused := f.message(t, conv, "operator", "ответ, который не дошёл", false)
		accepted := f.message(t, conv, "operator", "ответ, который дошёл", true)

		c, messages, _, err := service.Thread(ctx, conv)
		require.NoError(t, err)
		assert.Equal(t, support.ChannelTelegram, c.Channel, "канал нужен вебу для подписи поля ответа")
		assert.Nil(t, threadDelivered(t, messages, incoming))
		require.NotNil(t, threadDelivered(t, messages, refused))
		assert.False(t, *threadDelivered(t, messages, refused))
		require.NotNil(t, threadDelivered(t, messages, accepted))
		assert.True(t, *threadDelivered(t, messages, accepted))
	})

	t.Run("Обращение с сайта: у ответа нет поля delivered", func(t *testing.T) {
		conv := f.webConversation(t)
		reply := f.message(t, conv, "operator", "ответ посетителю", false)
		bot := f.message(t, conv, "bot", "ответ бота", false)

		c, messages, _, err := service.Thread(ctx, conv)
		require.NoError(t, err)
		assert.Equal(t, support.ChannelWeb, c.Channel)
		assert.Nil(t, threadDelivered(t, messages, reply))
		assert.Nil(t, threadDelivered(t, messages, bot))

		visitor, err := service.MessagesFor(ctx, conv)
		require.NoError(t, err)
		assert.Nil(t, threadDelivered(t, visitor, reply), "посетителю о Telegram сказать нечего")
	})

	t.Run("До миграции 065: доставка неизвестна — признака нет, повтор отклонён", func(t *testing.T) {
		conv := f.telegramConversation(t, 7002)
		old := f.message(t, conv, "operator", "старый ответ", false)
		_, err := f.db.ExecContext(ctx,
			`UPDATE support_messages SET delivery_unknown = true WHERE id = $1`, old)
		require.NoError(t, err)

		_, messages, _, err := service.Thread(ctx, conv)
		require.NoError(t, err)
		assert.Nil(t, threadDelivered(t, messages, old))

		before := len(f.sender.sent)
		code, body := f.retry(t, conv, old)
		assert.Equal(t, 409, code)
		assert.Equal(t, "conflict", body["code"])
		assert.Len(t, f.sender.sent, before, "ничего не отправлено")
	})
}

// Миграция 099 помечает только то, что было записано до 065, и только исходящее.
func TestMigration099_MarksOnlyMessagesOlderThanDeliveryTracking(t *testing.T) {
	f := newRetryFixture(t, "support_migration_099", nil)
	ctx := context.Background()
	conv := f.telegramConversation(t, 7003)

	old := f.message(t, conv, "operator", "до 065", false)
	oldIncoming := f.message(t, conv, "user", "входящее до 065", false)
	fresh := f.message(t, conv, "operator", "после 065", false)

	// Строки до 065 — раньше момента её применения в этой базе.
	_, err := f.db.ExecContext(ctx, `
		INSERT INTO schema_migrations (version, name, applied_at)
		VALUES (65, 'support_message_delivery', NOW() - interval '1 day')
		ON CONFLICT (version) DO UPDATE SET applied_at = EXCLUDED.applied_at`)
	require.NoError(t, err)
	_, err = f.db.ExecContext(ctx,
		`UPDATE support_messages SET created_at = NOW() - interval '30 days' WHERE id IN ($1, $2)`,
		old, oldIncoming)
	require.NoError(t, err)
	_, err = f.db.ExecContext(ctx, `UPDATE support_messages SET delivery_unknown = false`)
	require.NoError(t, err)

	upSQL, err := migrations.FS.ReadFile("099_support_delivery_unknown_up.sql")
	require.NoError(t, err)
	up := string(upSQL)
	for i := 0; i < 2; i++ { // повторный прогон ничего не меняет
		_, err = f.db.ExecContext(ctx, up)
		require.NoError(t, err)
	}

	unknown := func(id string) bool {
		var v bool
		require.NoError(t, f.db.QueryRowContext(ctx,
			`SELECT delivery_unknown FROM support_messages WHERE id = $1`, id).Scan(&v))
		return v
	}
	assert.True(t, unknown(old))
	assert.False(t, unknown(oldIncoming))
	assert.False(t, unknown(fresh))
}
