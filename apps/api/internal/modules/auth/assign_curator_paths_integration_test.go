//go:build integration

package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/require"
)

// Куратор назначается на каждом пути внутрь, а не только на форме регистрации.
//
// Завести аккаунт можно тремя способами: обычной регистрацией, переходом по
// одноразовой ссылке и через внешнего провайдера. Назначение куратора висело
// только на первом — при том, что на переделанной посадочной главный путь
// внутрь как раз второй. Нигде и никогда назначение не повторяется: клиент,
// заведённый ссылкой, остался бы без куратора навсегда, и увидел бы пустую
// переписку вместо человека, за которого заплатил.
//
// На 23 сентября на проде это ещё никого не задело — все 15 живых клиентов
// пришли формой регистрации, — но задело бы первого же, кто войдёт по ссылке.
//
// Каждый путь проверяется до строки в curator_client_relationships, на
// настоящей базе: назначение — три запроса подряд, и подмена показала бы
// зелёное на любом из них.
func TestEveryAccountPathAssignsCurator(t *testing.T) {
	ctx := context.Background()

	newFixture := func(t *testing.T, name string) (*database.DB, *auth.Service, int64) {
		t.Helper()
		db := testsupport.SchemaWithMigrations(t, name)
		service := auth.NewService(db.DB, &config.Config{}, logger.New())
		var curatorID int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role, email_verified)
			 VALUES ('live@example.test', 'x', 'Живой', 'coordinator', true) RETURNING id`).Scan(&curatorID))
		return db, service, curatorID
	}

	assignedCurator := func(t *testing.T, db *database.DB, clientID int64) int64 {
		t.Helper()
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT curator_id FROM curator_client_relationships
			  WHERE client_id = $1 AND status = 'active'`, clientID).Scan(&id),
			"клиент остался без куратора")
		return id
	}

	t.Run("вход по одноразовой ссылке", func(t *testing.T) {
		db, service, curatorID := newFixture(t, "assign_path_magiclink")

		// Ссылка на ещё не существующий аккаунт: user_id пуст, адрес свой —
		// именно так её пишет RequestMagicLink для незнакомого адреса.
		plain, hashed, err := auth.NewTokenGenerator().GenerateToken()
		require.NoError(t, err)
		_, err = db.ExecContext(ctx, `
			INSERT INTO magic_links (token_hash, email, user_id, expires_at, consents)
			VALUES ($1, 'by-link@example.test', NULL, $2, $3)`,
			hashed, time.Now().Add(time.Hour),
			[]byte(`{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`))
		require.NoError(t, err)

		result, _, err := service.ConsumeMagicLink(ctx, plain, "127.0.0.1", "test")
		require.NoError(t, err)
		require.NotNil(t, result.User)

		require.Equal(t, curatorID, assignedCurator(t, db, result.User.ID))
	})

	t.Run("вход через внешнего провайдера", func(t *testing.T) {
		db, service, curatorID := newFixture(t, "assign_path_provider")

		outcome, err := service.SignInWithProvider(ctx, "yandex", &oauth.Profile{
			ProviderUserID: "provider-user-1",
			Email:          "by-provider@example.test",
			Name:           "Через провайдера",
		}, "127.0.0.1", "test")
		require.NoError(t, err)
		require.NotNil(t, outcome.User, "провайдер не завёл аккаунт: %s", outcome.Result)

		require.Equal(t, curatorID, assignedCurator(t, db, outcome.User.User.ID))
	})
}
