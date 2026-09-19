package support

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/shared/llm"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeAnswerer struct {
	answer  string
	err     error
	calls   int
	prefix  string
	lastAsk string
}

func (f *fakeAnswerer) Ask(_ context.Context, prefix, question string, _ []llm.Turn) (string, error) {
	f.calls++
	f.prefix = prefix
	f.lastAsk = question
	return f.answer, f.err
}

type fakeSender struct {
	sent []string
}

func (f *fakeSender) SendMessage(_ context.Context, _ int64, text string) error {
	f.sent = append(f.sent, text)
	return nil
}

type fakeLeads struct {
	id  string
	err error

	// Create records what it was asked to save, so a test can assert the
	// consents and capture source actually reached it, and returns
	// createErr/createLead/createToken configured below.
	createIn    leads.CreateInput
	createErr   error
	createLead  *leads.Lead
	createToken string
	createCalls int
}

func (f *fakeLeads) LeadIDForToken(context.Context, string) (string, error) {
	return f.id, f.err
}

func (f *fakeLeads) Create(_ context.Context, in leads.CreateInput, _, _ string) (*leads.Lead, string, error) {
	f.createCalls++
	f.createIn = in
	if f.createErr != nil {
		return nil, "", f.createErr
	}
	lead := f.createLead
	if lead == nil {
		lead = &leads.Lead{ID: "lead-new"}
	}
	token := f.createToken
	if token == "" {
		token = "lead-token"
	}
	return lead, token, nil
}

func setupSupport(t *testing.T, answerer *fakeAnswerer) (*Service, *fakeSender, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	sender := &fakeSender{}
	service := NewService(db, logger.New(), answerer, sender, &fakeLeads{id: "lead-1"}, 100)
	return service, sender, mock
}

// expectConversation stands in for the upsert every incoming message performs.
func expectConversation(mock sqlmock.Sqlmock, status string) {
	mock.ExpectQuery("INSERT INTO support_conversations").
		WillReturnRows(sqlmock.NewRows([]string{"id", "chat_id", "lead_id", "user_id", "status", "channel"}).
			AddRow("conv-1", int64(555), nil, nil, status, ChannelTelegram))
}

func expectRecordedMessage(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("INSERT INTO support_messages").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("msg-1"))
	mock.ExpectExec("UPDATE support_conversations SET last_message_at").
		WillReturnResult(sqlmock.NewResult(0, 1))
}

func expectHistory(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("FROM support_messages").
		WillReturnRows(sqlmock.NewRows([]string{"author", "text"}).AddRow("user", "вопрос"))
}

func message(text string) IncomingMessage {
	return IncomingMessage{ChatID: 555, Username: "guest", Name: "Гость", Text: text}
}

func TestHandleMessage_AnswersFromTheCorpus(t *testing.T) {
	answerer := &fakeAnswerer{answer: "Куратор проверяет ваш дневник. (Раздел 04)"}
	service, sender, mock := setupSupport(t, answerer)

	expectConversation(mock, "open")
	expectRecordedMessage(mock)
	expectHistory(mock)
	expectRecordedMessage(mock)

	require.NoError(t, service.HandleMessage(context.Background(), message("что делает куратор?")))

	require.Len(t, sender.sent, 1)
	assert.Contains(t, sender.sent[0], "Куратор проверяет")
	// The corpus travels as the cached prefix, not glued onto the question.
	assert.Contains(t, answerer.prefix, "ТОЛЬКО по документации")
	assert.Contains(t, answerer.lastAsk, "что делает куратор?")
}

// A made-up answer about money or health data costs more than no answer, so a
// refusal must reach a person rather than the model's general knowledge.
func TestHandleMessage_RefusalBecomesAnEscalation(t *testing.T) {
	answerer := &fakeAnswerer{answer: EscalationMarker}
	service, sender, mock := setupSupport(t, answerer)

	expectConversation(mock, "open")
	expectRecordedMessage(mock)
	expectHistory(mock)
	mock.ExpectExec("UPDATE support_conversations").WillReturnResult(sqlmock.NewResult(0, 1))
	expectRecordedMessage(mock)

	require.NoError(t, service.HandleMessage(context.Background(), message("сколько стоит куратор?")))

	require.Len(t, sender.sent, 1)
	assert.Contains(t, sender.sent[0], "не буду придумывать")
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Nobody should have to argue with a bot to reach a person.
func TestHandleMessage_AskingForAPersonSkipsTheModel(t *testing.T) {
	answerer := &fakeAnswerer{answer: "не должно быть вызвано"}
	service, sender, mock := setupSupport(t, answerer)

	expectConversation(mock, "open")
	expectRecordedMessage(mock)
	mock.ExpectExec("UPDATE support_conversations").WillReturnResult(sqlmock.NewResult(0, 1))
	expectRecordedMessage(mock)

	require.NoError(t, service.HandleMessage(context.Background(), message("позовите оператора")))

	assert.Zero(t, answerer.calls, "the model must not be asked when a person was")
	require.Len(t, sender.sent, 1)
	assert.Contains(t, sender.sent[0], "Передал ваш вопрос человеку")
}

// A model failure must not leave somebody talking to nothing.
func TestHandleMessage_ModelFailureEscalatesRatherThanGoingSilent(t *testing.T) {
	answerer := &fakeAnswerer{err: errors.New("upstream down")}
	service, sender, mock := setupSupport(t, answerer)

	expectConversation(mock, "open")
	expectRecordedMessage(mock)
	expectHistory(mock)
	mock.ExpectExec("UPDATE support_conversations").WillReturnResult(sqlmock.NewResult(0, 1))
	expectRecordedMessage(mock)

	require.NoError(t, service.HandleMessage(context.Background(), message("как считается норма?")))

	require.Len(t, sender.sent, 1)
	assert.Contains(t, sender.sent[0], "человеку")
}

func TestHandleMessage_StartGreetsAndAttachesTheLead(t *testing.T) {
	answerer := &fakeAnswerer{}
	service, sender, mock := setupSupport(t, answerer)

	expectConversation(mock, "open")
	expectRecordedMessage(mock)
	mock.ExpectExec("UPDATE support_conversations SET lead_id").
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectRecordedMessage(mock)

	require.NoError(t, service.HandleMessage(context.Background(), message("/start signed-token")))

	require.Len(t, sender.sent, 1)
	assert.Contains(t, sender.sent[0], "отвечаю на вопросы")
	assert.Zero(t, answerer.calls)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// A stale or forged deep link still gets a conversation — just without the
// earlier answers attached.
func TestHandleMessage_StartWithAnUnusableLinkStillWorks(t *testing.T) {
	answerer := &fakeAnswerer{}
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	sender := &fakeSender{}
	service := NewService(db, logger.New(), answerer, sender,
		&fakeLeads{err: errors.New("invalid token")}, 100)

	expectConversation(mock, "open")
	expectRecordedMessage(mock)
	expectRecordedMessage(mock)

	require.NoError(t, service.HandleMessage(context.Background(), message("/start forged")))

	require.Len(t, sender.sent, 1)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// The webhook is public and every question costs a model call.
func TestAllowChat_ThrottlesOneChat(t *testing.T) {
	service, _, _ := setupSupport(t, &fakeAnswerer{})

	for i := 0; i < perChatLimit; i++ {
		assert.True(t, service.allowChat(1), "message %d should be allowed", i+1)
	}
	assert.False(t, service.allowChat(1), "the chat is over its limit")
	// One noisy chat must not silence anybody else.
	assert.True(t, service.allowChat(2))
}

func TestAllowModelCall_StopsAtTheDailyCeiling(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	service := NewService(db, logger.New(), &fakeAnswerer{}, &fakeSender{}, nil, 2)

	assert.True(t, service.allowModelCall())
	assert.True(t, service.allowModelCall())
	assert.False(t, service.allowModelCall())

	// A new day starts a new budget.
	service.callsDay = time.Now().UTC().Add(-48 * time.Hour).Truncate(24 * time.Hour)
	assert.True(t, service.allowModelCall())
}

// setupServiceWithDailyLimit builds a service against a mocked database with
// a chosen daily ceiling — the one thing TestWebCallsExhaustSharedModelCeiling
// and TestWebAnswersHonestlyWhenCeilingExhausted need to vary.
func setupServiceWithDailyLimit(t *testing.T, limit int) (*Service, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	service := NewService(db, logger.New(), &fakeAnswerer{}, &fakeSender{}, nil, limit)
	return service, mock
}

// Потолок защищает счёт, а счёт один. Веб-канал не имеет собственного лимита
// вызовов модели — allowModelCall не принимает канал вовсе, поэтому обращение
// с виджета тратит тот же бюджет, что и телеграмное. Тест красится прямо на
// числе разрешённых вызовов, а не через текст ответа: подмена ceiling-логики
// отдельным веб-лимитом не пройдёт мимо этой проверки, даже если текст ответа
// останется прежним.
func TestWebCallsExhaustSharedModelCeiling(t *testing.T) {
	svc, _ := setupServiceWithDailyLimit(t, 2)

	assert.True(t, svc.allowModelCall())
	assert.True(t, svc.allowModelCall())
	assert.False(t, svc.allowModelCall(), "третий вызов обязан быть отклонён независимо от канала")
}

// expectWebConversation задаёт ожидания на один проход HandleMessage по
// веб-разговору с исчерпанным потолком: вопрос посетителя записывается,
// потолок отворачивает модель, и честный отказ записывается и помечается
// отвеченным — никуда не отправляясь, потому что в веб-канале отправлять
// некуда.
func expectWebConversation(mock sqlmock.Sqlmock) {
	mock.ExpectQuery(`SELECT COUNT\(\*\) FROM support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`INSERT INTO support_messages`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("msg-user"))
	mock.ExpectExec(`UPDATE support_conversations SET last_message_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE support_conversations`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`INSERT INTO support_messages`).
		WithArgs("11111111-1111-1111-1111-111111111111", "bot", escalationReply, nil).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("msg-bot"))
	mock.ExpectExec(`UPDATE support_conversations SET last_message_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE support_conversations SET answered_at`).
		WillReturnResult(sqlmock.NewResult(0, 1))
}

// Существующая ветка "if !s.allowModelCall()" (service.go) уже отвечает
// человеку и зовёт оператора в Telegram; этот тест доказывает, что для
// веб-разговора она ведёт себя так же — а не молча зовёт модель мимо
// исчерпанного потолка, потому что канал другой.
//
// Потолок исчерпывается настоящим вызовом allowModelCall, а не лимитом 0:
// в этом коде dailyLimit == 0 значит "без ограничения" (service.go:
// `s.dailyLimit > 0 && s.callCount >= s.dailyLimit`), а не "ничего не разрешено" —
// лимит 0 сделал бы тест вырожденно зелёным по неверной причине.
func TestWebAnswersHonestlyWhenCeilingExhausted(t *testing.T) {
	svc, mock := setupServiceWithDailyLimit(t, 1)
	require.True(t, svc.allowModelCall(), "потолок должен пропустить единственный разрешённый вызов")

	expectWebConversation(mock)

	err := svc.HandleMessage(context.Background(), IncomingMessage{
		Conversation: &Conversation{
			ID:      "11111111-1111-1111-1111-111111111111",
			Channel: ChannelWeb,
		},
		Text: "вопрос",
	})

	require.NoError(t, err)

	// Красится на числе обращений к модели, а не косвенно на тексте ответа.
	answerer := svc.answerer.(*fakeAnswerer)
	assert.Zero(t, answerer.calls, "модель не должна была вызываться — потолок исчерпан")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPurgeOld_DeletesByLastMessage(t *testing.T) {
	service, _, mock := setupSupport(t, &fakeAnswerer{})

	mock.ExpectExec("DELETE FROM support_conversations").
		WillReturnResult(sqlmock.NewResult(0, 4))

	deleted, err := service.PurgeOld(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 4, deleted)
}

// Операторы отвечают, когда увидят: смен нет, часы нигде не объявлены.
// Поэтому ни один текст бота не должен называть срок — ни числом, ни словом
// вроде «скоро». Обещание, которого никто не давал, хуже отсутствия обещания:
// человек ждёт, пишет снова, и запоминает именно ожидание.
func TestBotPromisesNoDeadline(t *testing.T) {
	replies := map[string]string{
		"greeting":         greeting,
		"escalationReply":  escalationReply,
		"rateLimitedReply": rateLimitedReply,
		"busyReply":        busyReply,
		"signedInReply":    signedInReply,
	}

	// Слова, обещающие срок. «минуту» в rateLimitedReply — про паузу перед
	// следующим вопросом к боту, а не про ответ человека, поэтому проверяется
	// только соседство с обещанием ответа.
	deadlines := []string{
		"скоро", "в течение", "сразу же", "немедленно", "быстро",
		"через час", "в ближайшее", "оперативно", "круглосуточно отвеч",
	}

	for name, text := range replies {
		lower := strings.ToLower(text)
		for _, word := range deadlines {
			assert.NotContains(t, lower, word,
				"%s обещает срок (%q), которого никто не гарантирует", name, word)
		}
	}

	// Обратная сторона: если ответ человека упомянут, должно быть сказано, что
	// он не мгновенный. Иначе «передал человеку» читается как «сейчас ответят».
	for _, name := range []string{"escalationReply", "busyReply"} {
		assert.Contains(t, strings.ToLower(replies[name]), "не круглосуточно",
			"%s передаёт вопрос человеку, но не предупреждает об ожидании", name)
	}
}
