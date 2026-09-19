//go:build integration

// Проверяется на живой базе намеренно: sqlmock хранит ровно то, что ему велели
// вернуть, и не может уличить код, который положил бы токен в открытом виде —
// вопрос «что оказалось в строке» имеет смысл только для настоящей строки.
package support

import (
	"context"
	"errors"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Токен — доступ к переписке незнакомца, и должен храниться как пароль: в
// колонке обязан лежать хэш, не сам токен и не что-то, что его содержит.
func TestWebTokenIsNotStoredInPlainText(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_token_hash")
	svc := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	ctx := context.Background()

	id, token, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)

	var stored string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT web_token_hash FROM support_conversations WHERE id = $1`, id).Scan(&stored))

	assert.NotEqual(t, token, stored, "в колонке лежит сам токен, а не его хэш")
	assert.NotContains(t, stored, token, "хэш не должен содержать исходный токен")
}

// Заведённый разговор должен находиться собственным токеном на настоящей
// схеме — включая NULL chat_id, которого у веб-разговора нет.
func TestWebConversationRoundTripsThroughRealDatabase(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_roundtrip")
	svc := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	ctx := context.Background()

	id, token, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)

	found, err := svc.WebConversationByToken(ctx, token)
	require.NoError(t, err)
	assert.Equal(t, id, found.ID)
	assert.Equal(t, ChannelWeb, found.Channel)
	assert.Equal(t, "open", found.Status)
	assert.Equal(t, int64(0), found.ChatID, "у веб-разговора нет chat_id")
}

// Поиск обязан различать разговоры по токену, а не возвращать первый
// попавшийся веб-разговор: с двумя разговорами в таблице второй токен не
// должен открывать первый разговор.
func TestWebConversationByTokenFindsOnlyItsOwnConversation(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_isolation")
	svc := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	ctx := context.Background()

	firstID, _, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)
	_, secondToken, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)

	found, err := svc.WebConversationByToken(ctx, secondToken)

	require.NoError(t, err)
	assert.NotEqual(t, firstID, found.ID,
		"второй токен нашёл чужой разговор — поиск нечувствителен к токену")
}

// Отказ на поддельном токене доказателен только когда в таблице есть
// настоящие веб-разговоры: на пустой таблице любой токен не найдётся
// тривиально, и отказ ничего не проверяет.
func TestWebConversationByTokenRejectsForeignTokenAmongRealConversations(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_forged")
	svc := NewService(db.DB, logger.New(), nil, nil, nil, 100)
	ctx := context.Background()

	_, _, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)
	_, _, err = svc.StartWebConversation(ctx)
	require.NoError(t, err)

	var total int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT count(*) FROM support_conversations`).Scan(&total))
	require.Greater(t, total, 0,
		"в таблице обязаны быть настоящие разговоры — иначе отказ на поддельном токене ничего не проверяет")

	_, err = svc.WebConversationByToken(ctx, "токен-который-никто-никогда-не-выдавал")

	assert.True(t, errors.Is(err, apperrors.ErrNotFound))
}

// В браузер постучаться некуда. Ответ оператора обязан быть записан и
// прочитан по токену, а не отправлен — и попытки отправки быть не должно
// вовсе, иначе отказ несуществующего адресата попадёт в логи как ошибка
// доставки.
//
// Проверяется на живой базе намеренно: у веб-разговора chat_id — NULL
// (миграция 076), и byID до этой задачи сканировал его прямо в int64 —
// на sqlmock подмена вернула бы что угодно, что ей скажут, а здесь
// сканирование настоящей NULL-колонки либо падает, либо нет.
func TestWebReplyIsNotSentAnywhere(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_web_reply_channel")
	ctx := context.Background()

	sender := &countingSender{}
	svc := NewService(db.DB, logger.New(), nil, sender, nil, 100)

	id, token, err := svc.StartWebConversation(ctx)
	require.NoError(t, err)

	require.NoError(t, svc.AnswerAsOperator(ctx, id, 1, "Отвечаю"))

	assert.Empty(t, sender.sent, "в веб-канале отправлять некуда")

	conversation, err := svc.WebConversationByToken(ctx, token)
	require.NoError(t, err)
	messages, err := svc.MessagesFor(ctx, conversation.ID)
	require.NoError(t, err)
	require.NotEmpty(t, messages)
	assert.Equal(t, "Отвечаю", messages[len(messages)-1].Text)
}
