//go:build integration

package auth_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Назначение куратора отправляет событие.
//
// Спека product-analytics требует, чтобы факт назначения куратора формировался
// на сервере. Событие уходило только из админки, то есть при ручном назначении;
// автоназначение при заведении аккаунта — а это все три пути внутрь — молчало.
// На проде это выглядело как ноль назначений куратора при живых клиентах, у
// каждого из которых куратор есть.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/modules/auth/

type recordedEvent struct {
	name   string
	userID int64
}

type eventSpy struct {
	mu     sync.Mutex
	events []recordedEvent
}

func (s *eventSpy) RecordServerEvent(_ context.Context, name string, userID int64, _ map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, recordedEvent{name: name, userID: userID})
}

func (s *eventSpy) named(name string) []recordedEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	var found []recordedEvent
	for _, e := range s.events {
		if e.name == name {
			found = append(found, e)
		}
	}
	return found
}

// enterByLink creates an account through the magic link — the main way in since
// the landing page was reworked.
func enterByLink(t *testing.T, ctx context.Context, db *database.DB, service *auth.Service, email string) int64 {
	t.Helper()

	plain, hashed, err := auth.NewTokenGenerator().GenerateToken()
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `
		INSERT INTO magic_links (token_hash, email, user_id, expires_at, consents)
		VALUES ($1, $2, NULL, $3, $4)`,
		hashed, email, time.Now().Add(time.Hour),
		[]byte(`{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`))
	require.NoError(t, err)

	result, _, err := service.ConsumeMagicLink(ctx, plain, "127.0.0.1", "test")
	require.NoError(t, err)
	require.NotNil(t, result.User)
	return result.User.ID
}

func TestAutoAssignmentRecordsTheEvent(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "assign_event")
	spy := &eventSpy{}
	service := auth.NewService(db.DB, &config.Config{}, logger.New()).WithAnalytics(spy)

	var curatorID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('live@example.test', 'x', 'Живой', 'coordinator', true) RETURNING id`).Scan(&curatorID))

	clientID := enterByLink(t, ctx, db, service, "by-link@example.test")

	recorded := spy.named("curator_assigned")
	require.Len(t, recorded, 1, "назначение куратора должно быть записано ровно один раз")
	assert.Equal(t, clientID, recorded[0].userID,
		"событие относится к клиенту, который получил куратора")
}

// Назначения не было — события тоже нет. Иначе счётчик назначений считал бы
// попытки, а не назначения, и именно там, где куратора не хватило.
func TestNoCuratorMeansNoEvent(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "assign_event_none")
	spy := &eventSpy{}
	service := auth.NewService(db.DB, &config.Config{}, logger.New()).WithAnalytics(spy)

	// Ни одного куратора в базе: назначать некого.
	clientID := enterByLink(t, ctx, db, service, "no-curator@example.test")
	require.NotZero(t, clientID)

	assert.Empty(t, spy.named("curator_assigned"))
}
