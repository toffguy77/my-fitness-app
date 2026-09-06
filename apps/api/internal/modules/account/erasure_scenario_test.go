//go:build integration

package account_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/migrations"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A schema of its own per run, so the scenario can write freely and leave
// nothing behind.
func erasureSchema(t *testing.T) *database.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping integration test")
	}

	admin, err := sql.Open("pgx", dsn)
	require.NoError(t, err)
	defer func() { _ = admin.Close() }()
	require.NoError(t, admin.Ping())

	schema := fmt.Sprintf("erasure_test_%d", os.Getpid())
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
	require.NoError(t, database.NewMigrator(db, migrations.FS, logger.New()).
		Run(context.Background(), 0))
	return db
}

func account_(t *testing.T, db *database.DB, email, role string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ($1, 'x', $2, $3, NOW(), NOW()) RETURNING id`,
		email, "Имя "+email, role).Scan(&id))
	return id
}

func conversation(t *testing.T, db *database.DB, clientID, curatorID int64) string {
	t.Helper()
	var id string
	require.NoError(t, db.QueryRowContext(context.Background(),
		`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`,
		clientID, curatorID).Scan(&id))
	return id
}

func message(t *testing.T, db *database.DB, conversationID string, senderID int64, text string) {
	t.Helper()
	_, err := db.ExecContext(context.Background(),
		`INSERT INTO messages (conversation_id, sender_id, type, content)
		 VALUES ($1, $2, 'text', $3)`, conversationID, senderID, text)
	require.NoError(t, err)
}

// Erasing a client must not erase the curator's side of the work. The
// conversation is the curator's record too: it stays readable, and loses its
// author rather than its text.
func TestErasureKeepsTheCuratorsConversationAnonymised(t *testing.T) {
	db := erasureSchema(t)
	ctx := context.Background()
	service := account.NewService(db, logger.New(), nil)

	curator := account_(t, db, "curator@example.test", "coordinator")
	client := account_(t, db, "client@example.test", "client")

	conv := conversation(t, db, client, curator)
	message(t, db, conv, client, "Сегодня уложился в норму")
	message(t, db, conv, curator, "Хорошо, продолжайте")

	require.NoError(t, service.Erase(ctx, client))

	var system int64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE is_system = true`).Scan(&system))

	// The conversation survives, attributed to the placeholder.
	var owner int64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT client_id FROM conversations WHERE id = $1`, conv).Scan(&owner))
	assert.Equal(t, system, owner)

	// Both messages keep their text; the client's loses its author and the
	// curator's keeps theirs.
	rows, err := db.QueryContext(ctx,
		`SELECT sender_id, content FROM messages WHERE conversation_id = $1 ORDER BY created_at`, conv)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	got := map[string]int64{}
	for rows.Next() {
		var sender int64
		var content string
		require.NoError(t, rows.Scan(&sender, &content))
		got[content] = sender
	}
	require.NoError(t, rows.Err())

	assert.Equal(t, map[string]int64{
		"Сегодня уложился в норму": system,
		"Хорошо, продолжайте":      curator,
	}, got, "the conversation must stay readable and lose only its author")

	// Nothing anywhere still points at the erased account.
	var remaining int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM messages WHERE sender_id = $1`, client).Scan(&remaining))
	assert.Zero(t, remaining)

	var email string
	var name sql.NullString
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT email, name FROM users WHERE id = $1`, client).Scan(&email, &name))
	assert.Equal(t, fmt.Sprintf("deleted-%d@deleted.invalid", client), email)
	assert.False(t, name.Valid, "the name is what identifies a person in a curator's list")
}

// conversations carries UNIQUE(client_id, curator_id), and anonymising rewrites
// client_id to the one placeholder account. The second client a curator loses
// therefore collides with the first — and an erasure that fails is an erasure
// that never happens, because the job gives up on the whole account.
func TestErasureOfASecondClientOfTheSameCurator(t *testing.T) {
	db := erasureSchema(t)
	ctx := context.Background()
	service := account.NewService(db, logger.New(), nil)

	curator := account_(t, db, "curator2@example.test", "coordinator")
	first := account_(t, db, "first@example.test", "client")
	second := account_(t, db, "second@example.test", "client")

	firstConv := conversation(t, db, first, curator)
	secondConv := conversation(t, db, second, curator)
	message(t, db, firstConv, first, "Первый")
	message(t, db, secondConv, second, "Второй")

	require.NoError(t, service.Erase(ctx, first))
	require.NoError(t, service.Erase(ctx, second),
		"a curator with two departed clients must still be able to lose the second")

	var conversations int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM conversations WHERE curator_id = $1`, curator).Scan(&conversations))
	assert.Equal(t, 2, conversations, "neither conversation may disappear")

	var messages int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.curator_id = $1`, curator).Scan(&messages))
	assert.Equal(t, 2, messages)
}
