//go:build integration

package account_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Следы, которые стирание пропускало.
//
// Реестр стратегий проверяется отдельно (`TestErasureCoversSchema`), но реестр
// — это объявление, а не поведение. Разница здесь не умозрительная: стирание
// **не удаляет строку пользователя**, оно её обезличивает. Значит
// `ON DELETE CASCADE`, стоящий у всех этих таблиц, не срабатывает ни разу, и
// без явной стратегии в базе остались бы адрес и имя человека у провайдера,
// ключи push-подписки, история доставок и связка, по которой обезличенные
// события снова становятся именными.
//
// Каждая таблица здесь получает строку, принадлежащую человеку, и проверяется
// после стирания по своему обещанию: удалить — значит не осталось ничего;
// обезличить — значит строка на месте, а человека в ней нет.
func TestErasureLeavesNoTraceInTheTablesAddedLast(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "erasure_traces")
	ctx := context.Background()
	service := account.NewService(db, logger.New(), nil)

	user := account_(t, db, "следы@example.test", "client")
	other := account_(t, db, "сосед@example.test", "client")

	seed := func(query string, args ...any) {
		t.Helper()
		_, err := db.ExecContext(ctx, query, args...)
		require.NoError(t, err)
	}

	for _, id := range []int64{user, other} {
		seed(`INSERT INTO external_identities (user_id, provider, provider_user_id, email, name)
		      VALUES ($1::bigint, 'yandex', 'провайдер-' || $1::bigint, 'адрес@yandex.test', 'Имя у провайдера')`, id)
		seed(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		      VALUES ($1::bigint, 'https://push.test/' || $1::bigint, 'ключ', 'секрет')`, id)
		seed(`INSERT INTO notification_preferences (user_id, type, channel, enabled)
		      VALUES ($1, 'weekly_digest', 'email', true)`, id)
		seed(`INSERT INTO notifications (id, user_id, category, type, title, content)
		      VALUES (gen_random_uuid(), $1, 'main', 'general', 'Заголовок', 'Текст')`, id)
		seed(`INSERT INTO notification_deliveries (notification_id, user_id, channel)
		      SELECT id, $1, 'email' FROM notifications WHERE user_id = $1 LIMIT 1`, id)
		seed(`INSERT INTO ws_tickets (token_hash, user_id, expires_at)
		      VALUES ('хеш-' || $1::bigint, $1::bigint, NOW() + INTERVAL '1 minute')`, id)
		seed(`INSERT INTO analytics_identities (visitor_id, user_id)
		      VALUES (gen_random_uuid(), $1)`, id)
		seed(`INSERT INTO analytics_events (name, visitor_id, user_id, platform, properties)
		      VALUES ('signed_in', gen_random_uuid(), $1, 'server', '{"method":"yandex"}'::jsonb)`, id)
		seed(`INSERT INTO telegram_links (user_id, chat_id, username)
		      VALUES ($1::bigint, $1::bigint * 1000, 'ник' || $1::bigint)`, id)
		seed(`INSERT INTO telegram_link_tickets (token_hash, user_id, expires_at)
		      VALUES ('билет-' || $1::bigint, $1::bigint, NOW() + INTERVAL '10 minutes')`, id)
		seed(`INSERT INTO support_topics (client_id, thread_id)
		      VALUES ($1::bigint, $1::bigint * 7)`, id)
	}

	require.NoError(t, service.Erase(ctx, user))

	// Удалить — значит не осталось ничего. Столбец указывается рядом с
	// таблицей: у темы это client_id, и охранник схемы ловит её именно по
	// ссылке на users, а не по имени столбца.
	for _, table := range []struct{ name, column string }{
		{"external_identities", "user_id"},
		{"push_subscriptions", "user_id"},
		{"notification_preferences", "user_id"},
		{"notification_deliveries", "user_id"},
		{"ws_tickets", "user_id"},
		{"analytics_identities", "user_id"},
		{"telegram_links", "user_id"},
		{"telegram_link_tickets", "user_id"},
		{"support_topics", "client_id"},
	} {
		var left int
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT count(*) FROM `+table.name+` WHERE `+table.column+` = $1`, user).Scan(&left))
		assert.Zero(t, left, "в %s остались строки стёртого человека", table.name)

		// И ровно его: у соседа всё на месте.
		var neighbour int
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT count(*) FROM `+table.name+` WHERE `+table.column+` = $1`, other).Scan(&neighbour))
		assert.Equal(t, 1, neighbour, "стирание задело чужие строки в %s", table.name)
	}

	// Обезличить — значит строка на месте, а человека в ней нет. Воронка
	// считается из этих событий: удалить их — переписать историю задним числом.
	var events, named int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM analytics_events`).Scan(&events))
	assert.Equal(t, 2, events, "события воронки пропали — счётчики изменились задним числом")

	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM analytics_events WHERE user_id = $1`, user).Scan(&named))
	assert.Zero(t, named, "событие всё ещё указывает на стёртого человека")
}
