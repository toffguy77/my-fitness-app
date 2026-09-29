//go:build integration

package main

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Служебные учётные записи прогона команда не задевает: без куратора набор
// сквозных проверок упёрся бы в собственный платный доступ, и узнали бы мы об
// этом из красного CI, а не из дизайна.
//
// Проверяется отбор, а не запись: отбор — единственное место, где можно
// ошибиться необратимо, а список перед глазами стоит дешевле, чем выданные
// заново доступы.
func TestLive_ПропускаетСлужебныеУчётки(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "free_existing")

	var curatorID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&curatorID))

	link := func(email string) int64 {
		t.Helper()
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role, email_verified)
			 VALUES ($1, 'x', 'Кто-то', 'client', true) RETURNING id`, email).Scan(&id))
		_, err := db.ExecContext(ctx,
			`INSERT INTO curator_client_relationships (curator_id, client_id, status)
			 VALUES ($1, $2, 'active')`, curatorID, id)
		require.NoError(t, err)
		return id
	}

	liveID := link("human@example.com")
	link("stand-1@burcev.test")
	link("e2e-client@burcev.team")
	// Приставка, а не домен: director@burcev.team — человек, и его доступ снять
	// нужно вместе с остальными.
	directorID := link("director@burcev.team")

	targets, err := live(ctx, db.DB)
	require.NoError(t, err)

	emails := make([]string, 0, len(targets))
	ids := make([]int64, 0, len(targets))
	for _, a := range targets {
		emails = append(emails, a.clientEmail)
		ids = append(ids, a.clientID)
	}

	assert.ElementsMatch(t, []string{"human@example.com", "director@burcev.team"}, emails)
	assert.ElementsMatch(t, []int64{liveID, directorID}, ids)
	for _, a := range targets {
		assert.Equal(t, curatorID, a.curatorID, "куратора нужно уведомить, поэтому он возвращается")
	}
}

// Снятый доступ второй раз не снимается: повторный прогон не должен рассылать
// уведомления заново.
func TestLive_НеВидитУжеСнятые(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "free_existing_inactive")

	var curatorID, clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator2@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('done@example.com', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&clientID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status)
		 VALUES ($1, $2, 'inactive')`, curatorID, clientID)
	require.NoError(t, err)

	targets, err := live(ctx, db.DB)
	require.NoError(t, err)

	assert.Empty(t, targets)
}

// Удалённые учётные записи в счёт не идут: уведомлять некого.
func TestLive_НеВидитУдалённых(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "free_existing_deleted")

	var curatorID, clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('curator3@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified, deleted_at)
		 VALUES ('gone@example.com', 'x', 'Ушёл', 'client', true, now()) RETURNING id`).Scan(&clientID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status)
		 VALUES ($1, $2, 'active')`, curatorID, clientID)
	require.NoError(t, err)

	targets, err := live(ctx, db.DB)
	require.NoError(t, err)

	assert.Empty(t, targets)
}
