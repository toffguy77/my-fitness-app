package support

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeOperatorNotifier struct {
	created []*notifications.Notification
	err     error
}

func (f *fakeOperatorNotifier) CreateNotification(_ context.Context, n *notifications.Notification) error {
	f.created = append(f.created, n)
	return f.err
}

func (f *fakeOperatorNotifier) LanguageOf(context.Context, int64) string { return "ru" }

func operatorRows(ids ...int64) *sqlmock.Rows {
	rows := sqlmock.NewRows([]string{"id"})
	for _, id := range ids {
		rows.AddRow(id)
	}
	return rows
}

// An escalated conversation used to sit in the admin queue until somebody
// happened to look at it.
func TestEveryOperatorIsToldAboutAnEscalation(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	notifier := &fakeOperatorNotifier{}
	service := NewService(db, logger.New(), nil, nil, nil, 100).WithOperatorNotices(notifier)

	mock.ExpectQuery("SELECT id FROM users").WillReturnRows(operatorRows(1, 2))

	service.notifyOperators(context.Background(), "conv-1", "оплата")

	require.Len(t, notifier.created, 2)
	for _, n := range notifier.created {
		assert.Equal(t, notifications.TypeSupportEscalated, n.Type)
		assert.Equal(t, "Обращение ждёт ответа", n.Title)
		assert.Contains(t, n.Content, "оплата", "the reason is why an operator opens it first")
		require.NotNil(t, n.ActionURL)
		assert.Equal(t, "/admin/support", *n.ActionURL)
	}
	assert.Equal(t, int64(1), notifier.created[0].UserID)
	assert.Equal(t, int64(2), notifier.created[1].UserID)
}

// The escalation has already happened and the person in Telegram has already
// been told somebody will answer. A notification that cannot be written must
// not undo that.
func TestAnEscalationSurvivesAFailureToAnnounceIt(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	notifier := &fakeOperatorNotifier{err: errors.New("no")}
	service := NewService(db, logger.New(), nil, nil, nil, 100).WithOperatorNotices(notifier)

	mock.ExpectQuery("SELECT id FROM users").WillReturnRows(operatorRows(1))

	assert.NotPanics(t, func() {
		service.notifyOperators(context.Background(), "conv-1", "что-то")
	})
}

// Without a notifier the bot works exactly as before: the conversation still
// escalates and still appears in the queue.
func TestEscalationWorksWithoutANotifier(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	service := NewService(db, logger.New(), nil, nil, nil, 100)

	assert.NotPanics(t, func() {
		service.notifyOperators(context.Background(), "conv-1", "что-то")
	})
}

// An escalation nobody is told about is an escalation nobody answers, so it is
// worth saying out loud rather than passing quietly.
func TestNoOperatorsIsWorthSaying(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	notifier := &fakeOperatorNotifier{}
	service := NewService(db, logger.New(), nil, nil, nil, 100).WithOperatorNotices(notifier)

	mock.ExpectQuery("SELECT id FROM users").WillReturnRows(operatorRows())

	service.notifyOperators(context.Background(), "conv-1", "что-то")

	assert.Empty(t, notifier.created)
}
