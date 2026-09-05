package notifications

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// expectDeliveryPlan sets up the queries planDelivery makes: reading the
// recipient's settings, reading their stored choices, and one insert per
// channel the event may use.
func expectDeliveryPlan(mock sqlmock.Sqlmock, userID int64, inserts int) {
	mock.ExpectQuery(`FROM users WHERE id = \$1`).
		WithArgs(userID).
		WillReturnRows(sqlmock.NewRows([]string{"timezone", "quiet_hours_start", "quiet_hours_end", "email_unsubscribed_at"}).
			AddRow("Europe/Moscow", nil, nil, nil))
	mock.ExpectQuery(`FROM notification_preferences WHERE user_id = \$1`).
		WithArgs(userID).
		WillReturnRows(sqlmock.NewRows([]string{"type", "channel", "enabled"}))
	for i := 0; i < inserts; i++ {
		mock.ExpectExec(`INSERT INTO notification_deliveries`).
			WillReturnResult(sqlmock.NewResult(int64(i+1), 1))
	}
}

func TestChannelsForAnUnclassifiedType(t *testing.T) {
	// A type nobody has classified must not start mailing people by accident.
	assert.Equal(t, []Channel{ChannelApp}, channelsFor(NotificationType("something_new")))
}

func TestEveryDeclaredTypeIsClassified(t *testing.T) {
	// A type that can reach somebody but has no row in the matrix would be a
	// switch the settings screen never shows.
	for _, notificationType := range []NotificationType{
		TypeTrainerFeedback, TypeAchievement, TypeReminder, TypeSystemUpdate,
		TypeNewFeature, TypeGeneral, TypeNewContent, TypePlanUpdated,
		TypeTaskAssigned, TypeTaskOverdue, TypeFeedbackReceived,
		TypeExportReady, TypeClientLeft,
	} {
		_, ok := defaultChannels[notificationType]
		assert.True(t, ok, "type %s has no default channels", notificationType)
	}
}

func TestRecipientAllows(t *testing.T) {
	t.Run("the application channel cannot be turned off", func(t *testing.T) {
		r := &recipient{preferences: map[string]bool{"trainer_feedback:app": false}}
		assert.True(t, r.allows(TypeTrainerFeedback, ChannelApp))
	})

	t.Run("falls back to the default when nothing was chosen", func(t *testing.T) {
		r := &recipient{preferences: map[string]bool{}}
		assert.True(t, r.allows(TypeTrainerFeedback, ChannelEmail))
		assert.False(t, r.allows(TypeAchievement, ChannelEmail))
	})

	t.Run("a stored choice wins over the default", func(t *testing.T) {
		r := &recipient{preferences: map[string]bool{
			"trainer_feedback:email": false,
			"achievement:email":      true,
		}}
		assert.False(t, r.allows(TypeTrainerFeedback, ChannelEmail))
		assert.True(t, r.allows(TypeAchievement, ChannelEmail))
	})

	t.Run("unsubscribing closes the email channel whatever the matrix says", func(t *testing.T) {
		r := &recipient{
			preferences:      map[string]bool{"achievement:email": true},
			emailUnsubscribe: sql.NullTime{Time: time.Now(), Valid: true},
		}
		assert.False(t, r.allows(TypeAchievement, ChannelEmail))
		assert.True(t, r.allows(TypeAchievement, ChannelApp))
	})
}

func TestAfterQuietHours(t *testing.T) {
	moscow, err := time.LoadLocation("Europe/Moscow")
	require.NoError(t, err)

	quiet := func(start, end int16) *recipient {
		return &recipient{
			timezone:   "Europe/Moscow",
			quietStart: sql.NullInt16{Int16: start, Valid: true},
			quietEnd:   sql.NullInt16{Int16: end, Valid: true},
		}
	}

	t.Run("no quiet hours leaves the time alone", func(t *testing.T) {
		r := &recipient{timezone: "Europe/Moscow"}
		at := time.Date(2026, 3, 1, 2, 0, 0, 0, moscow)
		assert.Equal(t, at, r.afterQuietHours(at))
	})

	t.Run("a send outside quiet hours is not delayed", func(t *testing.T) {
		at := time.Date(2026, 3, 1, 12, 0, 0, 0, moscow)
		assert.Equal(t, at, quiet(22, 8).afterQuietHours(at))
	})

	t.Run("a send inside quiet hours waits for morning", func(t *testing.T) {
		at := time.Date(2026, 3, 1, 2, 0, 0, 0, moscow)
		got := quiet(22, 8).afterQuietHours(at).In(moscow)
		assert.Equal(t, 8, got.Hour())
		assert.Equal(t, 1, got.Day())
	})

	t.Run("late at night it waits for the next morning", func(t *testing.T) {
		at := time.Date(2026, 3, 1, 23, 30, 0, 0, moscow)
		got := quiet(22, 8).afterQuietHours(at).In(moscow)
		assert.Equal(t, 8, got.Hour())
		assert.Equal(t, 2, got.Day())
	})

	t.Run("quiet hours that do not wrap midnight also hold", func(t *testing.T) {
		at := time.Date(2026, 3, 1, 10, 0, 0, 0, moscow)
		got := quiet(9, 17).afterQuietHours(at).In(moscow)
		assert.Equal(t, 17, got.Hour())
	})

	t.Run("an unknown timezone does not hold the message", func(t *testing.T) {
		r := quiet(22, 8)
		r.timezone = "Mars/Olympus"
		at := time.Date(2026, 3, 1, 2, 0, 0, 0, time.UTC)
		assert.Equal(t, at, r.afterQuietHours(at))
	})

	t.Run("a start equal to its end is not quiet hours at all", func(t *testing.T) {
		at := time.Date(2026, 3, 1, 2, 0, 0, 0, moscow)
		assert.Equal(t, at, quiet(8, 8).afterQuietHours(at))
	})
}

func TestPlanDeliveryRecordsOneRowPerChannel(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	// An event that may use every channel: app (sent), email (pending), push
	// (skipped — not implemented yet).
	mock.ExpectBegin()
	expectDeliveryPlan(mock, 7, 3)
	mock.ExpectCommit()

	tx, err := service.db.BeginTx(context.Background(), nil)
	require.NoError(t, err)
	require.NoError(t, service.planDelivery(context.Background(), tx, &Notification{
		ID:     "9f6d4e0c-0000-0000-0000-000000000001",
		UserID: 7,
		Type:   TypeTrainerFeedback,
	}))
	require.NoError(t, tx.Commit())
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPlanDeliverySkipsChannelsTheRecipientClosed(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectBegin()
	mock.ExpectQuery(`FROM users WHERE id = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"timezone", "quiet_hours_start", "quiet_hours_end", "email_unsubscribed_at"}).
			AddRow("Europe/Moscow", nil, nil, time.Now()))
	mock.ExpectQuery(`FROM notification_preferences WHERE user_id = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"type", "channel", "enabled"}).
			AddRow("trainer_feedback", "push", false))
	// Only the application row remains.
	mock.ExpectExec(`INSERT INTO notification_deliveries`).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	tx, err := service.db.BeginTx(context.Background(), nil)
	require.NoError(t, err)
	require.NoError(t, service.planDelivery(context.Background(), tx, &Notification{
		ID:     "9f6d4e0c-0000-0000-0000-000000000002",
		UserID: 7,
		Type:   TypeTrainerFeedback,
	}))
	require.NoError(t, tx.Commit())
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestValidateQuietHours(t *testing.T) {
	hour := func(h int) *int { return &h }

	assert.NoError(t, validateQuietHours(nil, nil))
	assert.NoError(t, validateQuietHours(hour(22), hour(8)))
	assert.ErrorIs(t, validateQuietHours(hour(22), nil), apperrors.ErrValidation)
	assert.ErrorIs(t, validateQuietHours(hour(24), hour(8)), apperrors.ErrValidation)
	assert.ErrorIs(t, validateQuietHours(hour(-1), hour(8)), apperrors.ErrValidation)
}

func TestUnsubscribeToken(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()
	service.WithDigest(nil, "a-secret", "https://burcev.team")

	token, err := service.UnsubscribeToken(42)
	require.NoError(t, err)

	t.Run("a valid token names its account", func(t *testing.T) {
		userID, err := service.userForUnsubscribeToken(token)
		require.NoError(t, err)
		assert.Equal(t, int64(42), userID)
	})

	t.Run("a forged signature is refused", func(t *testing.T) {
		parts := strings.Split(token, ".")
		_, err := service.userForUnsubscribeToken(parts[0] + "." + parts[1] + ".notthesignature")
		assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
	})

	t.Run("somebody else's account cannot be named", func(t *testing.T) {
		parts := strings.Split(token, ".")
		_, err := service.userForUnsubscribeToken("43." + parts[1] + "." + parts[2])
		assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
	})

	t.Run("an expired token is refused", func(t *testing.T) {
		payload := "42." + "1000000000"
		expired := payload + "." + signDigest("a-secret", payload)
		_, err := service.userForUnsubscribeToken(expired)
		assert.ErrorIs(t, err, apperrors.ErrTokenExpired)
	})

	t.Run("a malformed token is refused", func(t *testing.T) {
		_, err := service.userForUnsubscribeToken("nonsense")
		assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
	})
}

func TestDigestNeedsASender(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()

	assert.False(t, service.DigestReady())
	_, err := service.SendDueDigests(context.Background())
	assert.ErrorIs(t, err, apperrors.ErrEmailUnavailable)
}

// digestRows builds the join the digest reads.
func digestRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "user_id", "email", "name", "title", "content", "action_url", "created_at", "already_read",
	})
}

func TestSendDueDigests(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	t.Run("everything unread arrives as one message", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		var sentTo string
		var sentItems []DigestItem
		service.WithDigest(func(_ context.Context, to, _ string, items []DigestItem, _ string) error {
			sentTo, sentItems = to, items
			return nil
		}, "a-secret", "https://burcev.team")

		mock.ExpectQuery(`FROM notification_deliveries d`).
			WillReturnRows(digestRows().
				AddRow(1, int64(7), "person@example.com", "Аня", "Первое", "Текст", "/chat", now, false).
				AddRow(2, int64(7), "person@example.com", "Аня", "Второе", "Текст", "", now, false))
		mock.ExpectExec(`UPDATE notification_deliveries`).
			WillReturnResult(sqlmock.NewResult(0, 2))

		sent, err := service.SendDueDigests(ctx)
		require.NoError(t, err)
		assert.Equal(t, 1, sent, "two events, one message")
		assert.Equal(t, "person@example.com", sentTo)
		require.Len(t, sentItems, 2)
		assert.Equal(t, "https://burcev.team/chat", sentItems[0].ActionURL,
			"a relative link in an email goes nowhere")
	})

	t.Run("a notification read in time is not mailed", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		called := false
		service.WithDigest(func(context.Context, string, string, []DigestItem, string) error {
			called = true
			return nil
		}, "a-secret", "https://burcev.team")

		mock.ExpectQuery(`FROM notification_deliveries d`).
			WillReturnRows(digestRows().
				AddRow(1, int64(7), "person@example.com", "", "Прочитано", "Текст", "", now, true))
		// Marked skipped: the email existed to catch what the application
		// missed, and it did not miss this one.
		mock.ExpectExec(`UPDATE notification_deliveries`).
			WillReturnResult(sqlmock.NewResult(0, 1))

		sent, err := service.SendDueDigests(ctx)
		require.NoError(t, err)
		assert.Equal(t, 0, sent)
		assert.False(t, called)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("a failure is recorded against the delivery, not swallowed", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		service.WithDigest(func(context.Context, string, string, []DigestItem, string) error {
			return errors.New("smtp said no")
		}, "a-secret", "https://burcev.team")

		mock.ExpectQuery(`FROM notification_deliveries d`).
			WillReturnRows(digestRows().
				AddRow(1, int64(7), "person@example.com", "", "Событие", "Текст", "", now, false))
		mock.ExpectExec(`UPDATE notification_deliveries`).
			WillReturnResult(sqlmock.NewResult(0, 1))

		sent, err := service.SendDueDigests(ctx)
		require.NoError(t, err, "one dead mailbox must not stop the run")
		assert.Equal(t, 0, sent)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("two people get two messages", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		recipients := []string{}
		service.WithDigest(func(_ context.Context, to, _ string, _ []DigestItem, _ string) error {
			recipients = append(recipients, to)
			return nil
		}, "a-secret", "https://burcev.team")

		mock.ExpectQuery(`FROM notification_deliveries d`).
			WillReturnRows(digestRows().
				AddRow(1, int64(7), "one@example.com", "", "Событие", "Текст", "", now, false).
				AddRow(2, int64(8), "two@example.com", "", "Событие", "Текст", "", now, false))
		mock.ExpectExec(`UPDATE notification_deliveries`).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec(`UPDATE notification_deliveries`).WillReturnResult(sqlmock.NewResult(0, 1))

		sent, err := service.SendDueDigests(ctx)
		require.NoError(t, err)
		assert.Equal(t, 2, sent)
		assert.Equal(t, []string{"one@example.com", "two@example.com"}, recipients)
	})
}

func TestUnsubscribeCancelsWhatIsAlreadyQueued(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()
	service.WithDigest(nil, "a-secret", "https://burcev.team")

	token, err := service.UnsubscribeToken(42)
	require.NoError(t, err)

	mock.ExpectExec(`UPDATE users SET email_unsubscribed_at`).
		WithArgs(int64(42)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	// Somebody who has just said "no more email" should not receive the one
	// that was already waiting.
	mock.ExpectExec(`UPDATE notification_deliveries SET status`).
		WillReturnResult(sqlmock.NewResult(0, 2))

	require.NoError(t, service.Unsubscribe(context.Background(), token))
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUnsubscribeTwiceIsNotAnError(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()
	service.WithDigest(nil, "a-secret", "https://burcev.team")

	token, err := service.UnsubscribeToken(42)
	require.NoError(t, err)

	// No rows updated: already unsubscribed, or no such account. Saying which
	// would leak whether an address is registered.
	mock.ExpectExec(`UPDATE users SET email_unsubscribed_at`).
		WillReturnResult(sqlmock.NewResult(0, 0))

	require.NoError(t, service.Unsubscribe(context.Background(), token))
	assert.NoError(t, mock.ExpectationsWereMet())
}
