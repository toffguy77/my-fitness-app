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

// Миграция 102: ключи Idempotency-Key. Ключ принадлежит пользователю —
// одинаковый UUID у двух людей не сталкивается, а второй такой же у одного
// упирается в первичный ключ: на этом держится «дубль не выполняется
// дважды». Откат убирает таблицу, повторный накат проходит.
func TestIdempotencyKeysMigrationUpAndDown(t *testing.T) {
	db := freshDatabase(t)
	ctx := context.Background()
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	var applied bool
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 102)`).Scan(&applied))
	assert.True(t, applied, "мигратор обязан записать 102 применённой")

	var alice, bob int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('a-idem@example.test','x','A','client') RETURNING id`).Scan(&alice))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('b-idem@example.test','x','B','client') RETURNING id`).Scan(&bob))

	insert := `INSERT INTO idempotency_keys (user_id, key, method, path, body_hash) VALUES ($1, $2, 'POST', '/p', 'h')`
	_, err := db.ExecContext(ctx, insert, alice, "3f0c5a6e-4a0b-4c47-9d38-3b7ac1f6a3e1")
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, insert, bob, "3f0c5a6e-4a0b-4c47-9d38-3b7ac1f6a3e1")
	require.NoError(t, err, "тот же ключ у другого пользователя — отдельная строка")
	_, err = db.ExecContext(ctx, insert, alice, "3f0c5a6e-4a0b-4c47-9d38-3b7ac1f6a3e1")
	require.Error(t, err, "второй такой же ключ у одного пользователя база обязана отклонить")
	_, err = db.ExecContext(ctx, insert, alice, "not-a-uuid")
	require.Error(t, err, "ключ — UUID")

	var status *int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT status FROM idempotency_keys WHERE user_id = $1`, alice).Scan(&status))
	assert.Nil(t, status, "новая строка — запрос в работе, без ответа")

	down, err := migrations.FS.ReadFile("102_idempotency_keys_down.sql")
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, string(down))
	require.NoError(t, err)
	var table *string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT to_regclass('idempotency_keys')::text`).Scan(&table))
	assert.Nil(t, table, "откат обязан убрать idempotency_keys")

	up, err := migrations.FS.ReadFile("102_idempotency_keys_up.sql")
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, string(up))
	require.NoError(t, err)
}
