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

// Миграция 100: вид клиента у refresh-токена. Старые строки становятся
// веб-сессиями, неизвестный вид база не принимает, а откат убирает всё, что
// миграция добавила, и оставляет вебу рабочую таблицу.
func TestNativeSessionMigrationUpAndDown(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('kind@example.test','x','K','client')
		 RETURNING id`).Scan(&userID))

	// Строка, вставленная так, как её вставлял код до миграции, — веб.
	_, err := db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, 'h-web', NOW() + INTERVAL '1 day')`, userID)
	require.NoError(t, err)
	var kind string
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT client_kind FROM refresh_tokens WHERE token_hash = 'h-web'`).Scan(&kind))
	assert.Equal(t, "web", kind)

	_, err = db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, client_kind, device_name)
		 VALUES ($1, 'h-ios', NOW() + INTERVAL '90 days', 'ios', 'iPhone 15')`, userID)
	require.NoError(t, err)

	_, err = db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, client_kind)
		 VALUES ($1, 'h-android', NOW(), 'android')`, userID)
	require.Error(t, err, "вид клиента вне ('web','ios') база обязана отклонить")

	_, err = db.ExecContext(ctx,
		`INSERT INTO oauth_handoff_codes (code_hash, app_challenge, user_id, result, expires_at)
		 VALUES ('c', 'challenge', $1, '{"status":"signed_in"}', NOW() + INTERVAL '60 seconds')`, userID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`UPDATE external_identities SET provider_refresh_token_enc = 'x' WHERE false`)
	require.NoError(t, err)

	down, err := migrations.FS.ReadFile("100_native_session_down.sql")
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, string(down))
	require.NoError(t, err)

	var columns int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = current_schema()
		  AND ((table_name = 'refresh_tokens' AND column_name IN ('client_kind', 'device_name'))
		    OR (table_name = 'external_identities' AND column_name = 'provider_refresh_token_enc'))`).Scan(&columns))
	assert.Zero(t, columns, "откат обязан убрать добавленные колонки")

	var table *string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT to_regclass('oauth_handoff_codes')::text`).Scan(&table))
	assert.Nil(t, table, "откат обязан убрать oauth_handoff_codes")

	// Веб после отката продолжает выпускать токены.
	_, err = db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, 'h-after', NOW())`, userID)
	require.NoError(t, err)

	// И миграцию можно накатить снова.
	up, err := migrations.FS.ReadFile("100_native_session_up.sql")
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, string(up))
	require.NoError(t, err)
}
