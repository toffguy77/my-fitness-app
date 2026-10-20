//go:build integration

package support_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/support"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Повтор недоставленного ответа — через обработчик и на настоящей базе.
//
// Вопросы здесь к строкам: появилась ли вторая запись в треде и стоит ли
// отметка о доставке. Подмена ответила бы «нет» и «да» в любом случае.

// countingSender records what it was asked to send and answers with err.
type countingSender struct {
	err  error
	sent []sentMessage
}

type sentMessage struct {
	chatID int64
	text   string
}

func (s *countingSender) SendMessage(_ context.Context, chatID int64, text string) error {
	s.sent = append(s.sent, sentMessage{chatID: chatID, text: text})
	return s.err
}

type retryFixture struct {
	db     *sql.DB
	sender *countingSender
	engine *gin.Engine
}

func newRetryFixture(t *testing.T, name string, sendErr error) retryFixture {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, name)
	sender := &countingSender{err: sendErr}
	service := support.NewService(db.DB, logger.New(), nil, sender, nil, 100)
	handler := support.NewHandler(&config.Config{}, logger.New(), service)

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/conversations/:id/messages/:messageId/retry", handler.RetryDelivery)
	return retryFixture{db: db.DB, sender: sender, engine: engine}
}

func (f retryFixture) telegramConversation(t *testing.T, chatID int64) string {
	t.Helper()
	var id string
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`INSERT INTO support_conversations (chat_id, status) VALUES ($1, 'escalated') RETURNING id`,
		chatID).Scan(&id))
	return id
}

func (f retryFixture) webConversation(t *testing.T) string {
	t.Helper()
	var id string
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`INSERT INTO support_conversations (channel, web_token_hash, status)
		 VALUES ('web', 'hash-of-a-token', 'escalated') RETURNING id`).Scan(&id))
	return id
}

func (f retryFixture) message(t *testing.T, conversationID, author, text string, delivered bool) string {
	t.Helper()
	var deliveredAt any
	if delivered {
		deliveredAt = time.Now()
	}
	var id string
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`INSERT INTO support_messages (conversation_id, author, text, delivered_at)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		conversationID, author, text, deliveredAt).Scan(&id))
	return id
}

func (f retryFixture) retry(t *testing.T, conversationID, messageID string) (int, map[string]any) {
	t.Helper()
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, httptest.NewRequest(http.MethodPost,
		"/conversations/"+conversationID+"/messages/"+messageID+"/retry", nil))
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body), w.Body.String())
	return w.Code, body
}

func (f retryFixture) thread(t *testing.T, conversationID string) int {
	t.Helper()
	var count int
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM support_messages WHERE conversation_id = $1`, conversationID).Scan(&count))
	return count
}

func (f retryFixture) delivered(t *testing.T, messageID string) bool {
	t.Helper()
	var at sql.NullTime
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`SELECT delivered_at FROM support_messages WHERE id = $1`, messageID).Scan(&at))
	return at.Valid
}

func TestRetryDelivery_SucceedsWithoutASecondRow(t *testing.T) {
	f := newRetryFixture(t, "support_retry_ok", nil)
	conversationID := f.telegramConversation(t, 820001)
	f.message(t, conversationID, "user", "вопрос", false)
	messageID := f.message(t, conversationID, "operator", "ответ, который не дошёл", false)
	before := f.thread(t, conversationID)

	status, body := f.retry(t, conversationID, messageID)

	require.Equal(t, http.StatusOK, status, body)
	message := body["data"].(map[string]any)["message"].(map[string]any)
	assert.Equal(t, messageID, message["id"])
	assert.Equal(t, true, message["delivered"])
	assert.Equal(t, "ответ, который не дошёл", message["text"])
	assert.Equal(t, "operator", message["author"])

	assert.True(t, f.delivered(t, messageID), "отметка о доставке не дошла до строки")
	assert.Equal(t, before, f.thread(t, conversationID), "повтор не должен заводить новую запись")
	assert.Equal(t, []sentMessage{{chatID: 820001, text: "ответ, который не дошёл"}}, f.sender.sent,
		"тот же текст тому же получателю")
}

func TestRetryDelivery_TelegramRefusesAgain(t *testing.T) {
	f := newRetryFixture(t, "support_retry_fail", errors.New("telegram returned 403: bot was blocked"))
	conversationID := f.telegramConversation(t, 820002)
	messageID := f.message(t, conversationID, "operator", "ответ", false)
	before := f.thread(t, conversationID)

	status, body := f.retry(t, conversationID, messageID)

	assert.Equal(t, http.StatusBadGateway, status)
	assert.Equal(t, "delivery_failed", body["code"])
	assert.False(t, f.delivered(t, messageID), "неотправленное не должно выглядеть отправленным")
	assert.Equal(t, before, f.thread(t, conversationID))
	assert.Len(t, f.sender.sent, 1, "попытка отправки была")
}

func TestRetryDelivery_RefusedWhereItMeansNothing(t *testing.T) {
	f := newRetryFixture(t, "support_retry_conflict", nil)
	telegram := f.telegramConversation(t, 820003)
	web := f.webConversation(t)

	cases := map[string]struct {
		conversation string
		message      string
	}{
		"уже доставлено":  {telegram, f.message(t, telegram, "operator", "дошло", true)},
		"входящее":        {telegram, f.message(t, telegram, "user", "вопрос", false)},
		"канал web":       {web, f.message(t, web, "operator", "ответ в веб", false)},
		"бот, доставлено": {telegram, f.message(t, telegram, "bot", "ответ бота", true)},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			before := f.thread(t, tc.conversation)

			status, body := f.retry(t, tc.conversation, tc.message)

			assert.Equal(t, http.StatusConflict, status)
			assert.Equal(t, "conflict", body["code"])
			assert.Equal(t, before, f.thread(t, tc.conversation))
		})
	}
	assert.Empty(t, f.sender.sent, "отправки не было ни в одном случае")
}

func TestRetryDelivery_UnknownMessage(t *testing.T) {
	f := newRetryFixture(t, "support_retry_missing", nil)
	telegram := f.telegramConversation(t, 820004)
	other := f.telegramConversation(t, 820005)
	foreign := f.message(t, other, "operator", "из другого обращения", false)

	for name, path := range map[string][2]string{
		"сообщение другого обращения": {telegram, foreign},
		"не uuid":       {telegram, "abc"},
		"нет обращения": {"6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f", foreign},
	} {
		t.Run(name, func(t *testing.T) {
			status, body := f.retry(t, path[0], path[1])
			assert.Equal(t, http.StatusNotFound, status)
			assert.Equal(t, "not_found", body["code"])
		})
	}
	assert.Empty(t, f.sender.sent)
}
