package support

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/openrouter"
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

func (f *fakeAnswerer) Ask(_ context.Context, prefix, question string, _ []openrouter.Turn) (string, error) {
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
}

func (f *fakeLeads) LeadIDForToken(context.Context, string) (string, error) {
	return f.id, f.err
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
		WillReturnRows(sqlmock.NewRows([]string{"id", "chat_id", "lead_id", "user_id", "status"}).
			AddRow("conv-1", int64(555), nil, nil, status))
}

func expectRecordedMessage(mock sqlmock.Sqlmock) {
	mock.ExpectExec("INSERT INTO support_messages").WillReturnResult(sqlmock.NewResult(1, 1))
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

func TestPurgeOld_DeletesByLastMessage(t *testing.T) {
	service, _, mock := setupSupport(t, &fakeAnswerer{})

	mock.ExpectExec("DELETE FROM support_conversations").
		WillReturnResult(sqlmock.NewResult(0, 4))

	deleted, err := service.PurgeOld(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 4, deleted)
}
