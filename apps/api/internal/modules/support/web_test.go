package support

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
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

// Мина, оставленная задачей 3: ListConversations сканирует chat_id прямо в
// int64. Веб-разговор попадёт в операторский список ровно тогда, когда
// заработают публичные маршруты — то есть в этой задаче, — и без починки
// упадёт на первой же строке с NULL chat_id.
func TestListConversationsHandlesWebConversationWithNullChatID(t *testing.T) {
	svc, _, mock := setupSupport(t, &fakeAnswerer{})

	mock.ExpectQuery(`SELECT COUNT\(\*\) FROM support_conversations`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(`FROM support_conversations`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "chat_id", "lead_id", "user_id", "status",
			"telegram_username", "telegram_name", "escalation_reason",
			"escalated_at", "last_message_at", "created_at",
		}).AddRow("conv-web-1", nil, nil, nil, "open", "", "", "", nil, time.Now(), time.Now()))

	conversations, total, err := svc.ListConversations(context.Background(), "", 20, 0)

	require.NoError(t, err)
	assert.Equal(t, 1, total)
	require.Len(t, conversations, 1)
	assert.Equal(t, int64(0), conversations[0].ChatID)
	require.NoError(t, mock.ExpectationsWereMet())
}

// Тот же дефект в Thread: оператор, открывший веб-разговор из очереди,
// получил бы ошибку сканирования вместо переписки.
func TestThreadHandlesWebConversationWithNullChatID(t *testing.T) {
	svc, _, mock := setupSupport(t, &fakeAnswerer{})

	mock.ExpectQuery(`FROM support_conversations WHERE id`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "chat_id", "lead_id", "user_id", "status",
			"telegram_username", "telegram_name", "escalation_reason",
			"escalated_at", "last_message_at", "created_at",
		}).AddRow("conv-web-1", nil, nil, nil, "open", "", "", "", nil, time.Now(), time.Now()))
	mock.ExpectQuery(`FROM support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "author", "text", "created_at", "delivered_at"}).
			AddRow("m1", "user", "Привет", time.Now(), nil))

	conversation, messages, lead, err := svc.Thread(context.Background(), "conv-web-1")

	require.NoError(t, err)
	assert.Equal(t, int64(0), conversation.ChatID)
	require.Len(t, messages, 1)
	assert.Nil(t, lead)
	require.NoError(t, mock.ExpectationsWereMet())
}

// ---------------------------------------------------------------------------
// Публичные маршруты виджета (handler.go): StartWeb, WebMessage, WebMessages.
// ---------------------------------------------------------------------------

// setupHandler wires a Handler backed by sqlmock behind a bare gin engine —
// no HTTP-level rate limiter, so these tests exercise the handler's own
// decisions (token lookup, text length, message cap) in isolation from the
// route's middleware, which is covered separately by
// TestWebMessageIsRateLimited via routerWithRealLimiter.
func setupHandler(t *testing.T) (*gin.Engine, *Service, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	service := NewService(db, logger.New(), &fakeAnswerer{answer: "Ответ из базы знаний."},
		&fakeSender{}, &fakeLeads{id: "lead-1"}, 100)
	h := NewHandler(&config.Config{}, logger.New(), service)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/public/support/web", h.StartWeb)
	r.POST("/public/support/web/message", h.WebMessage)
	r.GET("/public/support/web/messages", h.WebMessages)
	return r, service, mock
}

func post(r http.Handler, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func get(r http.Handler, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// expectConversationWithMessageCount mocks a valid, findable web conversation
// whose message count is already at (or past) the cap — so HandleMessage must
// refuse before touching anything else.
func expectConversationWithMessageCount(mock sqlmock.Sqlmock, count int) {
	mock.ExpectQuery(`FROM support_conversations WHERE web_token_hash`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "chat_id", "lead_id", "user_id", "status", "channel"}).
			AddRow("conv-1", nil, nil, nil, "open", ChannelWeb))
	mock.ExpectQuery(`SELECT COUNT\(\*\) FROM support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(count))
}

// Заведённый разговор отдаёт токен и идентификатор — сама выдача проверена в
// TestStartWebConversationIssuesToken на уровне сервиса; здесь — что
// обработчик отвечает 201 и оборачивает их в тело ответа.
func TestStartWeb_ReturnsTokenAndConversationID(t *testing.T) {
	r, _, mock := setupHandler(t)
	mock.ExpectQuery(`INSERT INTO support_conversations`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("conv-1"))

	w := post(r, "/public/support/web", `{}`)

	assert.Equal(t, http.StatusCreated, w.Code)
	var body struct {
		Data struct {
			Token          string `json:"token"`
			ConversationID string `json:"conversation_id"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "conv-1", body.Data.ConversationID)
	assert.NotEmpty(t, body.Data.Token)
}

// Поддельный, чужой и удалённый токен отвечают одним и тем же 404 — иначе
// перебор токенов стал бы наблюдаем снаружи.
func TestWebMessageRejectsForgedToken(t *testing.T) {
	r, _, mock := setupHandler(t)
	mock.ExpectQuery(`FROM support_conversations`).WillReturnError(sql.ErrNoRows)

	w := post(r, "/public/support/web/message", `{"token":"forged","text":"привет"}`)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// Вопрос длиннее предела отвергается до обращения к базе — короче протекшего
// поддельного токена и дешевле, чем платить за модель на длинном тексте.
func TestWebMessageRejectsOverlongText(t *testing.T) {
	r, _, _ := setupHandler(t)

	body, err := json.Marshal(map[string]string{
		"token": "whatever",
		"text":  strings.Repeat("а", MaxWebMessageRunes+1),
	})
	require.NoError(t, err)

	w := post(r, "/public/support/web/message", string(body))

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "короче")
}

// Разговор, в котором уже MaxWebMessagesPerConversation сообщений, отказывает
// новому — до записи сообщения и до вызова модели.
func TestWebConversationRefusesWhenTooManyMessages(t *testing.T) {
	r, _, mock := setupHandler(t)
	expectConversationWithMessageCount(mock, MaxWebMessagesPerConversation)

	w := post(r, "/public/support/web/message", `{"token":"good","text":"ещё"}`)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	require.NoError(t, mock.ExpectationsWereMet())
}

// Разговор с числом сообщений ниже предела отвечает как обычно — предел
// сравнивается правильной стороной, не срабатывает раньше времени.
func TestWebConversationAllowsMessageBelowCap(t *testing.T) {
	r, _, mock := setupHandler(t)
	expectConversationWithMessageCount(mock, MaxWebMessagesPerConversation-1)
	mock.ExpectQuery(`INSERT INTO support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("msg-1"))
	mock.ExpectExec(`UPDATE support_conversations SET last_message_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`FROM support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"author", "text"}))
	mock.ExpectQuery(`INSERT INTO support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("msg-2"))
	mock.ExpectExec(`UPDATE support_conversations SET last_message_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE support_conversations SET answered_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	w := post(r, "/public/support/web/message", `{"token":"good","text":"ещё"}`)

	assert.Equal(t, http.StatusOK, w.Code)
	require.NoError(t, mock.ExpectationsWereMet())
}

// WebMessages отдаёт переписку и статус разговора, найденного по токену.
func TestWebMessages_ReturnsTranscriptAndStatus(t *testing.T) {
	r, _, mock := setupHandler(t)
	mock.ExpectQuery(`FROM support_conversations WHERE web_token_hash`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "chat_id", "lead_id", "user_id", "status", "channel"}).
			AddRow("conv-1", nil, nil, nil, "escalated", ChannelWeb))
	mock.ExpectQuery(`FROM support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "author", "text", "created_at", "delivered_at"}).
			AddRow("m1", "user", "Привет", time.Now(), nil))

	w := get(r, "/public/support/web/messages?token=good")

	assert.Equal(t, http.StatusOK, w.Code)
	var body struct {
		Data struct {
			Status   string    `json:"status"`
			Messages []Message `json:"messages"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "escalated", body.Data.Status)
	require.Len(t, body.Data.Messages, 1)
}

// Чтение переписки поддельным токеном отвечает тем же 404, что и отправка.
func TestWebMessages_UnknownTokenIsNotFound(t *testing.T) {
	r, _, mock := setupHandler(t)
	mock.ExpectQuery(`FROM support_conversations`).WillReturnError(sql.ErrNoRows)

	w := get(r, "/public/support/web/messages?token=forged")

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// routerWithRealLimiter wires the route the way production does — the real
// AuthRateLimiter middleware in front of the handler — so this exercises the
// per-IP ceiling itself, not the handler's own checks. The service is nil:
// every request the limiter lets through answers 503, which is irrelevant to
// what this test is proving.
func routerWithRealLimiter(t *testing.T) *gin.Engine {
	t.Helper()
	h := NewHandler(&config.Config{}, logger.New(), nil)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	rl := middleware.NewAuthRateLimiter()
	r.POST("/api/v1/public/support/web/message", rl.Limit("support-web-message"), h.WebMessage)
	return r
}

// Без потолка по адресу один посетитель мог бы звать модель сколько угодно
// раз в минуту — счёт за это платит не он.
func TestWebMessageIsRateLimited(t *testing.T) {
	r := routerWithRealLimiter(t)

	var last *httptest.ResponseRecorder
	for i := 0; i < 40; i++ {
		last = post(r, "/api/v1/public/support/web/message", `{"token":"t","text":"вопрос"}`)
	}

	assert.Equal(t, http.StatusTooManyRequests, last.Code)
}
