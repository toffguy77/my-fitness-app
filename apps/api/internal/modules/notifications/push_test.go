package notifications

import (
	"context"
	"database/sql/driver"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A key pair shaped like a real one. Nothing here reaches a push service, so
// the values only have to be non-empty.
func testPush() PushConfig {
	return PushConfig{
		PublicKey:  "BJxc9ExampleExampleExampleExampleExampleExampleExampleExampleExampleExampleExampleEx",
		PrivateKey: "aVeryPrivateKeyValue",
		Subject:    "mailto:support@burcev.team",
	}
}

func TestPushIsOffWithoutKeys(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()

	assert.False(t, service.PushReady())

	_, err := service.SendDuePushes(context.Background())
	assert.ErrorIs(t, err, apperrors.ErrEmailUnavailable)

	err = service.Subscribe(context.Background(), 1, PushSubscription{
		Endpoint: "https://push.example/1", P256dh: "k", Auth: "a",
	})
	assert.ErrorIs(t, err, apperrors.ErrEmailUnavailable)
}

func TestPushIsOffWithHalfAKeyPair(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()

	// A push service refuses a request signed without all three, so half a
	// configuration must read as "off", not as "on and broken".
	service.WithPush(PushConfig{PublicKey: "public", Subject: "mailto:a@b.c"})
	assert.False(t, service.PushReady())
}

func TestSubscribeRefusesAnIncompleteSubscription(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()
	service.WithPush(testPush())

	// Without both keys a push can be delivered but not decrypted, which looks
	// to everybody like a message that silently never arrived.
	for _, sub := range []PushSubscription{
		{P256dh: "k", Auth: "a"},
		{Endpoint: "https://push.example/1", Auth: "a"},
		{Endpoint: "https://push.example/1", P256dh: "k"},
	} {
		assert.ErrorIs(t, service.Subscribe(context.Background(), 1, sub), apperrors.ErrValidation)
	}
}

func TestSubscribeReplacesTheSameBrowsersRow(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()
	service.WithPush(testPush())

	// Browsers rotate endpoints on their own; a table that only grows is a
	// table of addresses nobody can deliver to.
	mock.ExpectExec(`INSERT INTO push_subscriptions`).
		WithArgs(int64(7), "https://push.example/1", "key", "auth", "Firefox").
		WillReturnResult(sqlmock.NewResult(1, 1))

	require.NoError(t, service.Subscribe(context.Background(), 7, PushSubscription{
		Endpoint: "https://push.example/1", P256dh: "key", Auth: "auth", UserAgent: "Firefox",
	}))
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestSubscribeStoresNoUserAgentRatherThanAnEmptyOne(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()
	service.WithPush(testPush())

	mock.ExpectExec(`INSERT INTO push_subscriptions`).
		WithArgs(int64(7), "https://push.example/1", "key", "auth", nil).
		WillReturnResult(sqlmock.NewResult(1, 1))

	require.NoError(t, service.Subscribe(context.Background(), 7, PushSubscription{
		Endpoint: "https://push.example/1", P256dh: "key", Auth: "auth", UserAgent: "  ",
	}))
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUnsubscribePushIsScopedToItsOwner(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	// An endpoint is not a secret. Without the user id anybody holding one
	// could unsubscribe somebody else's browser.
	mock.ExpectExec(`DELETE FROM push_subscriptions WHERE user_id = \$1 AND endpoint = \$2`).
		WithArgs(int64(7), "https://push.example/1").
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, service.UnsubscribePush(context.Background(), 7, "https://push.example/1"))
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUnsubscribePushNeedsAnEndpoint(t *testing.T) {
	service, _, cleanup := setupTestService(t)
	defer cleanup()

	assert.ErrorIs(t, service.UnsubscribePush(context.Background(), 7, ""), apperrors.ErrValidation)
}

func TestPushWithNoSubscriptionIsSkippedNotFailed(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()
	service.WithPush(testPush())

	mock.ExpectQuery(`FROM notification_deliveries d`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "nid", "title", "content", "action_url"}).
			AddRow(1, int64(7), "9f6d4e0c-0000-0000-0000-000000000001", "Событие", "Текст", "/chat"))
	mock.ExpectQuery(`FROM push_subscriptions WHERE user_id`).
		WillReturnRows(sqlmock.NewRows([]string{"endpoint", "p256dh", "auth"}))
	// Nobody to reach is not a failure: the person turned push on once and has
	// since cleared their browser.
	mock.ExpectExec(`UPDATE notification_deliveries`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	delivered, err := service.SendDuePushes(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 0, delivered)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPurgeDeadSubscriptions(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectExec(`DELETE FROM push_subscriptions`).
		WillReturnResult(sqlmock.NewResult(0, 3))

	purged, err := service.PurgeDeadSubscriptions(context.Background(), 180*24*time.Hour)
	require.NoError(t, err)
	assert.Equal(t, int64(3), purged)
}

// dueWithin matches a timestamp argument that falls inside a window from now.
type dueWithin struct{ window time.Duration }

func (d dueWithin) Match(value driver.Value) bool {
	at, ok := value.(time.Time)
	return ok && at.Before(time.Now().Add(d.window))
}

func TestPushIsPlannedWithoutTheEmailDelay(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()
	service.WithPush(testPush())

	mock.ExpectBegin()
	mock.ExpectQuery(`FROM users WHERE id = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"timezone", "quiet_hours_start", "quiet_hours_end", "email_unsubscribed_at"}).
			AddRow("Europe/Moscow", nil, nil, nil))
	mock.ExpectQuery(`FROM notification_preferences WHERE user_id = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"type", "channel", "enabled"}))

	notificationID := "9f6d4e0c-0000-0000-0000-000000000003"
	mock.ExpectExec(`INSERT INTO notification_deliveries`).
		WithArgs(notificationID, int64(7), ChannelApp, StatusSent, dueWithin{time.Minute}).
		WillReturnResult(sqlmock.NewResult(1, 1))
	// Email waits, so that somebody already in the application is not written
	// to about something they have just read.
	mock.ExpectExec(`INSERT INTO notification_deliveries`).
		WithArgs(notificationID, int64(7), ChannelEmail, StatusPending, dueWithin{defaultEmailDelay + time.Minute}).
		WillReturnResult(sqlmock.NewResult(2, 1))
	// Push does not: arriving before they open it is the whole point.
	mock.ExpectExec(`INSERT INTO notification_deliveries`).
		WithArgs(notificationID, int64(7), ChannelPush, StatusPending, dueWithin{time.Minute}).
		WillReturnResult(sqlmock.NewResult(3, 1))
	mock.ExpectCommit()

	tx, err := service.db.BeginTx(context.Background(), nil)
	require.NoError(t, err)
	require.NoError(t, service.planDelivery(context.Background(), tx, &Notification{
		ID:     notificationID,
		UserID: 7,
		Type:   TypeTrainerFeedback,
	}))
	require.NoError(t, tx.Commit())
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPushEndpointRefusesTheInternalNetwork(t *testing.T) {
	// The endpoint is a URL the client chose and the server later makes
	// requests to. Without this, subscribing with an internal address turns
	// every notification into a POST from inside the network.
	refused := []string{
		"http://fcm.googleapis.com/fcm/send/abc",       // not https
		"https://127.0.0.1/push",                       // loopback
		"https://[::1]/push",                           // loopback, v6
		"https://169.254.169.254/latest/meta-data/",    // link-local metadata
		"https://10.0.0.5/push",                        // private
		"https://192.168.1.10/push",                    // private
		"https://172.16.0.1/push",                      // private
		"https://100.64.0.1/push",                      // carrier-grade NAT
		"https://[::ffff:127.0.0.1]/push",              // v4-mapped loopback
		"https://fcm.googleapis.com:4000/fcm/send/abc", // a service on our own host
		"https://0.0.0.0/push",
		"not a url at all",
		"https:///push",
	}
	for _, endpoint := range refused {
		assert.ErrorIs(t, validatePushEndpoint(endpoint), apperrors.ErrValidation,
			"should have refused %s", endpoint)
	}
}

func TestPushEndpointAcceptsRealPushServices(t *testing.T) {
	for _, endpoint := range []string{
		"https://fcm.googleapis.com/fcm/send/abcdef",
		"https://updates.push.services.mozilla.com/wpush/v2/abcdef",
		"https://web.push.apple.com/QW1hem9u",
		"https://xyz.notify.windows.com/w/?token=abc",
		"https://fcm.googleapis.com:443/fcm/send/abcdef",
	} {
		assert.NoError(t, validatePushEndpoint(endpoint), "should have accepted %s", endpoint)
	}
}

func TestSubscribeRefusesAnInternalEndpoint(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()
	service.WithPush(testPush())

	err := service.Subscribe(context.Background(), 7, PushSubscription{
		Endpoint: "https://169.254.169.254/latest/meta-data/",
		P256dh:   "key",
		Auth:     "auth",
	})

	assert.ErrorIs(t, err, apperrors.ErrValidation)
	// Nothing was stored: the check happens before the insert, so a rejected
	// endpoint never becomes a scheduled outbound request.
	assert.NoError(t, mock.ExpectationsWereMet())
}
