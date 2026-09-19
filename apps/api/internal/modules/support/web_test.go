package support

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

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

// Оператор отвечает в веб-разговор через тот же эндпоинт, что и в телеграмный:
// список обращений не различает канал, и это единственный путь, которым
// answerAs встречает разговор без chat_id. До этой задачи byID сканировал
// chat_id прямо в int64 и упал бы на NULL; здесь же проверяется вторая
// половина минирования — что от такого разговора не пытаются звать
// sender.SendMessage, которому просто некуда звонить.
func TestAnswerAsOperatorInWebConversationDoesNotSend(t *testing.T) {
	svc, sender, mock := setupSupport(t, &fakeAnswerer{})

	mock.ExpectQuery(`SELECT id, chat_id, lead_id, user_id, status, channel FROM support_conversations WHERE id`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "chat_id", "lead_id", "user_id", "status", "channel"}).
			AddRow("conv-1", nil, nil, nil, "open", ChannelWeb))
	mock.ExpectQuery(`INSERT INTO support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("msg-1"))
	mock.ExpectExec(`UPDATE support_conversations SET last_message_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE support_conversations SET answered_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := svc.AnswerAsOperator(context.Background(), "conv-1", 1, "Отвечаю")

	require.NoError(t, err)
	assert.Empty(t, sender.sent, "в веб-канале отправлять некуда")
	require.NoError(t, mock.ExpectationsWereMet())
}

// Симметричная проверка: телеграмный разговор обязан по-прежнему отправляться
// — веб-ветка не должна проглотить путь, для которого она не предназначена.
func TestAnswerAsOperatorInTelegramConversationStillSends(t *testing.T) {
	svc, sender, mock := setupSupport(t, &fakeAnswerer{})

	mock.ExpectQuery(`SELECT id, chat_id, lead_id, user_id, status, channel FROM support_conversations WHERE id`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "chat_id", "lead_id", "user_id", "status", "channel"}).
			AddRow("conv-2", int64(555), nil, nil, "open", ChannelTelegram))
	mock.ExpectQuery(`INSERT INTO support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("msg-2"))
	mock.ExpectExec(`UPDATE support_conversations SET last_message_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE support_conversations SET answered_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE support_messages SET delivered_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err := svc.AnswerAsOperator(context.Background(), "conv-2", 1, "Отвечаю")

	require.NoError(t, err)
	require.Len(t, sender.sent, 1)
	assert.Equal(t, "Отвечаю", sender.sent[0])
	require.NoError(t, mock.ExpectationsWereMet())
}

// MessagesFor отдаёт переписку в порядке появления и не путает входящие
// (доставлять некуда, Delivered == nil) с исходящими, для которых доставка —
// осмысленный факт.
func TestMessagesForOrdersByCreationAndMarksDelivery(t *testing.T) {
	svc, _, mock := setupSupport(t, &fakeAnswerer{})

	now := time.Now()
	mock.ExpectQuery(`FROM support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "author", "text", "created_at", "delivered_at"}).
			AddRow("m1", "user", "Привет", now, nil).
			AddRow("m2", "bot", "Здравствуйте", now.Add(time.Second), now.Add(time.Second)))

	messages, err := svc.MessagesFor(context.Background(), "conv-1")

	require.NoError(t, err)
	require.Len(t, messages, 2)
	assert.Equal(t, "Привет", messages[0].Text)
	assert.Nil(t, messages[0].Delivered, "у входящего доставлять некуда")
	require.NotNil(t, messages[1].Delivered)
	assert.True(t, *messages[1].Delivered)
	require.NoError(t, mock.ExpectationsWereMet())
}
