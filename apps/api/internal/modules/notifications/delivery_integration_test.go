//go:build integration

package notifications_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/migrations"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The delivery layer against a real schema.
//
// Unit tests here run on sqlmock, which accepts any column name at all — so a
// query reading `timezone` from `users`, where the column does not exist,
// passed every one of them. In production that meant loadRecipient failed, so
// planDelivery failed, so CreateNotification rolled back: **not one
// notification was created**, silently, because every caller logs the error and
// carries on.
//
// These tests execute the real SQL. A wrong column or a wrong table fails here.
//
// Run with: go test -tags=integration ./internal/modules/notifications/

func schemaWithMigrations(t *testing.T) *database.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping integration test")
	}

	admin, err := sql.Open("pgx", dsn)
	require.NoError(t, err)
	defer func() { _ = admin.Close() }()
	require.NoError(t, admin.Ping())

	schema := fmt.Sprintf("notif_test_%d", os.Getpid())
	_, err = admin.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
	require.NoError(t, err)
	_, err = admin.Exec(fmt.Sprintf("CREATE SCHEMA %s", schema))
	require.NoError(t, err)

	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	scoped, err := sql.Open("pgx", fmt.Sprintf("%s%ssearch_path=%s,public", dsn, separator, schema))
	require.NoError(t, err)
	require.NoError(t, scoped.Ping())

	t.Cleanup(func() {
		_ = scoped.Close()
		if cleanup, err := sql.Open("pgx", dsn); err == nil {
			_, _ = cleanup.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
			_ = cleanup.Close()
		}
	})

	db := &database.DB{DB: scoped}
	migrator := database.NewMigrator(db, migrations.FS, logger.New())
	require.NoError(t, migrator.Run(context.Background(), 0))
	return db
}

// somebody creates an account with settings, as registration does.
func somebody(t *testing.T, db *database.DB) int64 {
	t.Helper()

	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ($1, 'x', 'Кто-то', 'client', NOW(), NOW()) RETURNING id`,
		fmt.Sprintf("delivery-%d@example.test", os.Getpid())).Scan(&id))

	_, err := db.ExecContext(context.Background(),
		`INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, id)
	require.NoError(t, err)

	return id
}

func TestCreateNotificationAgainstTheRealSchema(t *testing.T) {
	db := schemaWithMigrations(t)
	service := notifications.NewService(db, logger.New())
	userID := somebody(t, db)

	notification := &notifications.Notification{
		UserID:   userID,
		Category: notifications.CategoryMain,
		Type:     notifications.TypeTrainerFeedback,
		Title:    "Ответ куратора",
		Content:  "Текст",
	}

	// This is the call that has been failing in production.
	require.NoError(t, service.CreateNotification(context.Background(), notification),
		"a notification could not be created against the real schema")
	require.NotEmpty(t, notification.ID)

	// And it planned its delivery: the application row always, email because
	// this event type is one somebody is waiting on.
	deliveries, err := service.DeliveriesFor(context.Background(), notification.ID)
	require.NoError(t, err)

	channels := map[string]string{}
	for _, d := range deliveries {
		channels[d.Channel] = d.Status
	}
	assert.Equal(t, "sent", channels["app"], "the notification itself is the application delivery")
	assert.Equal(t, "pending", channels["email"], "an event somebody waits on should be mailed")
}

func TestDeliveryPreferencesAgainstTheRealSchema(t *testing.T) {
	db := schemaWithMigrations(t)
	service := notifications.NewService(db, logger.New())
	userID := somebody(t, db)

	prefs, err := service.GetDeliveryPreferences(context.Background(), userID)
	require.NoError(t, err, "the settings screen could not read its own preferences")
	require.NotEmpty(t, prefs.Types, "every event type a person can act on should be listed")
	assert.NotEmpty(t, prefs.Timezone, "the timezone is read from user_settings, not users")
	assert.False(t, prefs.EmailUnsubscribed)

	// A deliberate choice is stored and read back; the defaults are not.
	quiet := 22
	morning := 8
	require.NoError(t, service.UpdateDeliveryPreferences(context.Background(), userID,
		notifications.UpdateDeliveryPreferencesRequest{
			Types:           []notifications.TypeSetting{{Type: "trainer_feedback", App: true, Email: false}},
			QuietHoursStart: &quiet,
			QuietHoursEnd:   &morning,
		}))

	after, err := service.GetDeliveryPreferences(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, after.QuietHoursStart)
	assert.Equal(t, 22, *after.QuietHoursStart)
	assert.Equal(t, 8, *after.QuietHoursEnd)

	for _, setting := range after.Types {
		if setting.Type == "trainer_feedback" {
			assert.False(t, setting.Email, "the stored choice was not read back")
		}
	}
}

func TestQuietHoursDelayInsteadOfDropping(t *testing.T) {
	db := schemaWithMigrations(t)
	service := notifications.NewService(db, logger.New())
	userID := somebody(t, db)

	// Quiet hours covering the whole day, so whenever this runs it is quiet.
	start, end := 0, 23
	require.NoError(t, service.UpdateDeliveryPreferences(context.Background(), userID,
		notifications.UpdateDeliveryPreferencesRequest{QuietHoursStart: &start, QuietHoursEnd: &end}))

	notification := &notifications.Notification{
		UserID: userID, Category: notifications.CategoryMain,
		Type: notifications.TypeTaskAssigned, Title: "Задача", Content: "Текст",
	}
	require.NoError(t, service.CreateNotification(context.Background(), notification))

	var notBefore, createdAt sql.NullTime
	require.NoError(t, db.QueryRowContext(context.Background(),
		`SELECT not_before, created_at FROM notification_deliveries
		 WHERE notification_id = $1 AND channel = 'email'`, notification.ID).
		Scan(&notBefore, &createdAt))

	// Delayed, never dropped: a notice that arrives in the morning is late, a
	// notice that never arrives is a bug.
	assert.True(t, notBefore.Time.After(createdAt.Time),
		"a notification in quiet hours should wait, got not_before=%v created=%v",
		notBefore.Time, createdAt.Time)
}
