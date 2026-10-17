//go:build integration

package database_test

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/migrations"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Миграция 103: apns_devices становится push_devices с сохранением токенов и
// installation_id, у уведомлений появляется target, у пушей — задание на
// адресат. Откат возвращает схему 095, и миграцию можно накатить снова.
func TestPushDevicesMigrationKeepsDevicesAndRollsBack(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	exec := func(file string) {
		t.Helper()
		sql, err := migrations.FS.ReadFile(file)
		require.NoError(t, err)
		_, err = db.ExecContext(ctx, string(sql))
		require.NoError(t, err, file)
	}

	// Состояние до 103: телефон, зарегистрированный по схеме 095, и старое
	// уведомление.
	exec("103_push_devices_and_targets_down.sql")
	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('push-mig@example.test','x','P','client')
		 RETURNING id`).Scan(&userID))
	_, err := db.ExecContext(ctx, `
		INSERT INTO apns_devices (user_id, token, installation_id, environment, app_version)
		VALUES ($1, 'abc', '11111111-1111-4111-8111-111111111111', 'sandbox', '0.4.0')`, userID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `
		INSERT INTO notifications (id, user_id, category, type, title, content)
		VALUES ('00000000-0000-4000-8000-000000000001', $1, 'main', 'general', 'Т', 'С')`, userID)
	require.NoError(t, err)

	exec("103_push_devices_and_targets_up.sql")

	var installation, environment, platform string
	var disabled *string
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT installation_id, environment, platform, disabled_at::text
		FROM push_devices WHERE token = 'abc' AND user_id = $1`, userID).
		Scan(&installation, &environment, &platform, &disabled))
	assert.Equal(t, "11111111-1111-4111-8111-111111111111", installation, "installation_id сохранён")
	assert.Equal(t, "sandbox", environment)
	assert.Equal(t, "ios", platform)
	assert.Nil(t, disabled, "перенесённое устройство активно")

	var target string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT target::text FROM notifications WHERE user_id = $1`, userID).Scan(&target))
	assert.JSONEq(t, `{"kind":"notifications"}`, target, "старая запись ведёт в список уведомлений")

	var showText bool
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT push_show_message_text FROM users WHERE id = $1`, userID).Scan(&showText))
	assert.True(t, showText, "текст сообщений показывается по умолчанию")

	// Задание — ровно на одно: уведомление или сообщение; адресат — по транспорту.
	var deviceID int64
	require.NoError(t, db.QueryRowContext(ctx, `SELECT id FROM push_devices WHERE token = 'abc'`).Scan(&deviceID))
	_, err = db.ExecContext(ctx, `
		INSERT INTO push_deliveries (notification_id, user_id, transport, device_id, status)
		VALUES ('00000000-0000-4000-8000-000000000001', $1, 'apns', $2, 'cancelled')`, userID, deviceID)
	require.NoError(t, err, "cancelled — допустимый статус")
	_, err = db.ExecContext(ctx, `
		INSERT INTO push_deliveries (user_id, transport, device_id) VALUES ($1, 'apns', $2)`, userID, deviceID)
	require.Error(t, err, "задание без уведомления и без сообщения")
	_, err = db.ExecContext(ctx, `
		INSERT INTO push_deliveries (notification_id, user_id, transport, device_id)
		VALUES ('00000000-0000-4000-8000-000000000001', $1, 'webpush', $2)`, userID, deviceID)
	require.Error(t, err, "Web Push на устройство iOS")
	_, err = db.ExecContext(ctx, `
		INSERT INTO push_devices (user_id, token, installation_id, environment, platform)
		VALUES ($1, 'def', '22222222-2222-4222-8222-222222222222', 'production', 'android')`, userID)
	require.Error(t, err, "платформа вне ('ios')")

	exec("103_push_devices_and_targets_down.sql")
	var table *string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT to_regclass('push_deliveries')::text`).Scan(&table))
	assert.Nil(t, table, "откат убирает push_deliveries")
	var count int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM apns_devices WHERE installation_id = '11111111-1111-4111-8111-111111111111'`).Scan(&count))
	assert.Equal(t, 1, count, "откат возвращает устройство в apns_devices")

	exec("103_push_devices_and_targets_up.sql")
}
