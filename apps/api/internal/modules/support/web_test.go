package support

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// StartWebConversation заводит разговор и выдаёт предъявительский токен: сама
// строка появляется в базе через один INSERT, канал — 'web'.
func TestStartWebConversationIssuesToken(t *testing.T) {
	svc, _, mock := setupSupport(t, &fakeAnswerer{})

	mock.ExpectQuery(`INSERT INTO support_conversations`).
		WithArgs(sqlmock.AnyArg(), ChannelWeb).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).
			AddRow("11111111-1111-1111-1111-111111111111"))

	id, token, err := svc.StartWebConversation(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "11111111-1111-1111-1111-111111111111", id)
	assert.NotEmpty(t, token)
	require.NoError(t, mock.ExpectationsWereMet())
}

// Поддельный или чужой токен не должен различаться от "разговора не
// существует" — иначе перебор токенов стал бы наблюдаем.
func TestWebConversationRejectsForgedToken(t *testing.T) {
	svc, _, mock := setupSupport(t, &fakeAnswerer{})
	mock.ExpectQuery(`FROM support_conversations WHERE web_token_hash`).
		WillReturnError(sql.ErrNoRows)

	_, err := svc.WebConversationByToken(context.Background(), "forged")

	assert.True(t, errors.Is(err, apperrors.ErrNotFound))
	require.NoError(t, mock.ExpectationsWereMet())
}

// Пустой токен отвергается без обращения к базе: нечего хэшировать и не с чем
// сравнивать.
func TestWebConversationByTokenRejectsEmptyToken(t *testing.T) {
	svc, _, mock := setupSupport(t, &fakeAnswerer{})

	_, err := svc.WebConversationByToken(context.Background(), "")

	assert.True(t, errors.Is(err, apperrors.ErrNotFound))
	require.NoError(t, mock.ExpectationsWereMet(), "пустой токен не должен доходить до запроса")
}

// Разговор без chat_id (веб-канал) обязан читаться без ошибки сканирования:
// в БД chat_id у него NULL, а Conversation.ChatID остаётся простым int64.
func TestWebConversationByTokenFoundHandlesNullChatID(t *testing.T) {
	svc, _, mock := setupSupport(t, &fakeAnswerer{})
	mock.ExpectQuery(`FROM support_conversations WHERE web_token_hash`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "chat_id", "lead_id", "user_id", "status", "channel"}).
			AddRow("conv-1", nil, nil, nil, "open", ChannelWeb))

	conversation, err := svc.WebConversationByToken(context.Background(), "real-token")

	require.NoError(t, err)
	assert.Equal(t, "conv-1", conversation.ID)
	assert.Equal(t, ChannelWeb, conversation.Channel)
	assert.Equal(t, int64(0), conversation.ChatID)
	require.NoError(t, mock.ExpectationsWereMet())
}

// hashWebToken — то, что хранится вместо токена. Проверяем только форму
// (детерминизм, необратимость по строке): что реально лежит в базе — вопрос к
// живой БД, не к этой функции, см. web_integration_test.go.
func TestHashWebTokenIsDeterministicAndDoesNotContainTheToken(t *testing.T) {
	token := "abc-secret-token"

	first := hashWebToken(token)
	second := hashWebToken(token)

	assert.Equal(t, first, second)
	assert.NotEqual(t, token, first)
	assert.NotContains(t, first, token)
}
