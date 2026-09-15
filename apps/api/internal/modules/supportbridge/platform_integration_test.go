//go:build integration

package supportbridge_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/modules/supportbridge"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Ответ из Telegram виден в приложении так же, как написанный там.
//
// Иначе переписка у клиента распадается на две половины, и половину он не
// найдёт.
func TestReplyFromTelegramLandsInThePlatformChat(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "bridge_platform")
	ctx := context.Background()
	delivery := supportbridge.NewPlatformDelivery(db.DB)

	var curator, clientID int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('кур@e.test','x','К','coordinator') RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('кли@e.test','x','Кл','client') RETURNING id`).Scan(&clientID))
	_, err := db.ExecContext(ctx, `INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1,$2,'active')`, curator, clientID)
	require.NoError(t, err)

	require.NoError(t, delivery.ToPlatform(ctx, clientID, curator, "Отвечаю из Telegram"))

	var sender int64
	var content string
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT m.sender_id, m.content FROM messages m
		  JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.client_id = $1`, clientID).Scan(&sender, &content))
	assert.Equal(t, curator, sender, "ответ записан не от куратора")
	assert.Equal(t, "Отвечаю из Telegram", content)
}

// Автор не установлен — берём активного куратора: беседа всё равно его.
func TestReplyWithoutAKnownAuthorUsesTheActiveCurator(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "bridge_platform_auto")
	ctx := context.Background()
	delivery := supportbridge.NewPlatformDelivery(db.DB)

	var curator, clientID int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('кур@e.test','x','К','coordinator') RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('кли@e.test','x','Кл','client') RETURNING id`).Scan(&clientID))
	_, err := db.ExecContext(ctx, `INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1,$2,'active')`, curator, clientID)
	require.NoError(t, err)

	require.NoError(t, delivery.ToPlatform(ctx, clientID, 0, "Без автора"))

	var sender int64
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT m.sender_id FROM messages m JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.client_id = $1`, clientID).Scan(&sender))
	assert.Equal(t, curator, sender)
}

// Повторная доставка не плодит бесед: у пары клиент-куратор она одна.
func TestSecondReplyReusesTheConversation(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "bridge_platform_reuse")
	ctx := context.Background()
	delivery := supportbridge.NewPlatformDelivery(db.DB)

	var curator, clientID int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('кур@e.test','x','К','coordinator') RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('кли@e.test','x','Кл','client') RETURNING id`).Scan(&clientID))
	_, err := db.ExecContext(ctx, `INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1,$2,'active')`, curator, clientID)
	require.NoError(t, err)

	require.NoError(t, delivery.ToPlatform(ctx, clientID, curator, "первый"))
	require.NoError(t, delivery.ToPlatform(ctx, clientID, curator, "второй"))

	var conversations, messages int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT count(*) FROM conversations WHERE client_id = $1`, clientID).Scan(&conversations))
	require.NoError(t, db.QueryRowContext(ctx, `SELECT count(*) FROM messages`).Scan(&messages))
	assert.Equal(t, 1, conversations, "на каждый ответ завели новую беседу")
	assert.Equal(t, 2, messages)
}

// Привязка Telegram находит учётную запись куратора.
func TestCuratorFoundByTelegramChat(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "bridge_curator_lookup")
	ctx := context.Background()
	resolver := supportbridge.NewCuratorByTelegram(db.DB)

	var curator int64
	require.NoError(t, db.QueryRowContext(ctx, `INSERT INTO users (email,password,name,role) VALUES ('кур@e.test','x','К','coordinator') RETURNING id`).Scan(&curator))
	_, err := db.ExecContext(ctx, `INSERT INTO telegram_links (user_id, chat_id) VALUES ($1, 8080)`, curator)
	require.NoError(t, err)

	id, found, err := resolver.ByTelegramChat(ctx, 8080)
	require.NoError(t, err)
	assert.True(t, found)
	assert.Equal(t, curator, id)

	// Незнакомый Telegram — не ошибка: куратор мог не привязывать аккаунт.
	_, found, err = resolver.ByTelegramChat(ctx, 9999)
	require.NoError(t, err)
	assert.False(t, found)
}
