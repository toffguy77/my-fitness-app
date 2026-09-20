//go:build integration

// Проверяется на живой базе намеренно: и ограничение CHECK, и умолчание
// колонки — это поведение базы, которого sqlmock не знает. Именно ограничение
// не даёт появиться разговору, которого потом никто не найдёт, а умолчание
// решает, каким каналом окажутся уже существующие разговоры.
package support_test

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/burcev/api/migrations"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Разговор без идентификатора или с двумя идентификаторами не должен попасть
// в базу: такую строку потом никто не найдёт ни по chat_id, ни по токену.
func TestConversationRequiresExactlyOneIdentity(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_channel_identity")

	_, err := db.Exec(
		`INSERT INTO support_conversations (chat_id, web_token_hash, channel) VALUES (NULL, NULL, 'web')`)
	require.Error(t, err, "разговор без идентификатора обязан быть отвергнут")

	_, err = db.Exec(
		`INSERT INTO support_conversations (chat_id, web_token_hash, channel) VALUES (42, 'hash', 'web')`)
	require.Error(t, err, "разговор с двумя идентификаторами обязан быть отвергнут")

	_, err = db.Exec(
		`INSERT INTO support_conversations (chat_id, channel) VALUES (43, 'telegram')`)
	require.NoError(t, err)

	_, err = db.Exec(
		`INSERT INTO support_conversations (web_token_hash, channel) VALUES ('hash2', 'web')`)
	require.NoError(t, err)
}

// Канал — это не свободный текст: значение вне telegram/web не должно попасть
// в базу, иначе Answerer и доставка ответа однажды получат канал, который
// никто не умеет обрабатывать.
func TestConversationChannelMustBeKnown(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_channel_enum")

	_, err := db.Exec(
		`INSERT INTO support_conversations (chat_id, channel) VALUES (44, 'carrier-pigeon')`)
	require.Error(t, err, "неизвестный канал обязан быть отвергнут")
}

// Существующие разговоры получают канал значением по умолчанию — данные не
// правятся, и их число не меняется. Таблица заполняется до применения
// миграции 076, как это происходит на живой базе, а не после: иначе
// утверждение «все существующие помечены telegram» истинно вырожденно на
// пустой таблице и ничего не проверяет.
func TestExistingConversationsBecomeTelegram(t *testing.T) {
	db := schemaBeforeChannelMigration(t, "support_channel_backfill")
	ctx := context.Background()

	_, err := db.ExecContext(ctx,
		`INSERT INTO support_conversations (chat_id) VALUES (900001), (900002), (900003)`)
	require.NoError(t, err, "разговор в старой схеме заводится одним только chat_id")

	// Применяем оставшиеся миграции (076 в их числе) поверх уже заполненной
	// таблицы — так же, как это случится на живой базе при выкатке.
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).Run(ctx, 0))

	var total, telegram int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT count(*) FROM support_conversations`).Scan(&total))
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM support_conversations WHERE channel = 'telegram' AND chat_id IS NOT NULL`).
		Scan(&telegram))

	require.Greater(t, total, 0,
		"в таблице обязаны быть существующие разговоры — иначе сравнение ничего не проверяет")
	assert.Equal(t, total, telegram, "существующие разговоры обязаны остаться телеграмными")
}

// Откат должен быть безопасен, когда в таблице есть оба канала: веб-разговор
// уходит явным DELETE, телеграмный переживает возврат chat_id к NOT NULL.
func TestChannelMigrationDownKeepsTelegramConversations(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "support_channel_rollback")
	ctx := context.Background()

	_, err := db.ExecContext(ctx,
		`INSERT INTO support_conversations (chat_id, channel) VALUES (950001, 'telegram')`)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO support_conversations (web_token_hash, channel) VALUES ('rollback-hash', 'web')`)
	require.NoError(t, err)

	downSQL, err := migrations.FS.ReadFile("076_support_channels_down.sql")
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, string(downSQL))
	require.NoError(t, err, "откат обязан пройти без ошибки при обоих каналах в таблице")

	var total int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT count(*) FROM support_conversations`).Scan(&total))
	assert.Equal(t, 1, total, "веб-разговор должен быть удалён, телеграмный — остаться")

	var chatID sql.NullInt64
	require.NoError(t, db.QueryRowContext(ctx, `SELECT chat_id FROM support_conversations`).Scan(&chatID))
	require.True(t, chatID.Valid)
	assert.Equal(t, int64(950001), chatID.Int64)
}

var migrationVersionPattern = regexp.MustCompile(`^(\d+)_`)

// filteredMigrations exposes only migration files at or below max, so a test
// can build the schema exactly as it looked right before one specific
// migration, instead of after every migration including it.
type filteredMigrations struct {
	fs.FS
	max int
}

func (f filteredMigrations) ReadDir(name string) ([]fs.DirEntry, error) {
	entries, err := fs.ReadDir(f.FS, name)
	if err != nil {
		return nil, err
	}
	out := make([]fs.DirEntry, 0, len(entries))
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		m := migrationVersionPattern.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		v, err := strconv.Atoi(m[1])
		if err != nil || v > f.max {
			continue
		}
		out = append(out, e)
	}
	return out, nil
}

// schemaBeforeChannelMigration mirrors testsupport.SchemaWithMigrations, but
// stops one migration short of 076 so a test can insert a row the way it
// looked before channel/web_token_hash existed.
func schemaBeforeChannelMigration(t *testing.T, prefix string) *database.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping integration test")
	}

	admin, err := sql.Open("pgx", dsn)
	require.NoError(t, err)
	defer func() { _ = admin.Close() }()
	require.NoError(t, admin.Ping())

	// See testsupport.SchemaWithMigrations: an extension belongs to one schema
	// for the whole database, so it goes in public before anything else runs.
	_, err = admin.Exec("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public")
	require.NoError(t, err)

	schema := fmt.Sprintf("%s_test_%d", prefix, os.Getpid())
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
	require.NoError(t, database.NewMigrator(db, filteredMigrations{FS: migrations.FS, max: 75}, logger.New()).
		Run(context.Background(), 0))
	return db
}
