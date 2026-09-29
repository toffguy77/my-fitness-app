//go:build integration

package auth_test

import (
	"context"
	"database/sql"
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

// Ни один путь внутрь не даёт живому клиенту куратора, а служебному — даёт.
//
// Тест перевёрнут осознанно: прежде он требовал обратного — чтобы куратор
// назначался на каждом пути. История, ради которой он был заведён, остаётся
// верной и важной, поэтому переписана, а не удалена.
//
// Завести аккаунт можно тремя способами: обычной регистрацией, переходом по
// одноразовой ссылке и через внешнего провайдера. Назначение висело только на
// первом — при том, что на переделанной посадочной главный путь внутрь как раз
// второй. Нигде и никогда назначение не повторяется: клиент, заведённый
// ссылкой, остался бы без куратора навсегда, и увидел бы пустую переписку
// вместо человека, за которого заплатил. На 23 сентября на проде это ещё никого
// не задело — все 15 живых клиентов пришли формой регистрации, — но задело бы
// первого же, кто войдёт по ссылке.
//
// С появлением платного доступа опасность сменила знак. Куратор — платная
// услуга, и путь, который назначает его сам, отдаёт её бесплатно. Прежний
// дефект — «путь забыл назначить» — теперь норма, а ошибкой стало назначение;
// но проверять по-прежнему нужно все три пути, потому что забыть можно и
// запрет.
//
// Служебные учётные записи прогона — исключение, и оно проверяется здесь же:
// без куратора набор сквозных проверок упёрся бы в собственный платный доступ.
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

	// Служебному клиенту нужен служебный куратор: живого ему не отдают, а
	// другого в прогоне нет.
	addServiceCurator := func(t *testing.T, db *database.DB) int64 {
		t.Helper()
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role, email_verified)
			 VALUES ('curator@burcev.test', 'x', 'Служебный', 'coordinator', true) RETURNING id`).Scan(&id))
		return id
	}

	assignedCurator := func(t *testing.T, db *database.DB, clientID int64) (int64, bool) {
		t.Helper()
		var id int64
		err := db.QueryRowContext(ctx,
			`SELECT curator_id FROM curator_client_relationships
			  WHERE client_id = $1 AND status = 'active'`, clientID).Scan(&id)
		if err == sql.ErrNoRows {
			return 0, false
		}
		require.NoError(t, err)
		return id, true
	}

	requireNoCurator := func(t *testing.T, db *database.DB, clientID int64) {
		t.Helper()
		_, assigned := assignedCurator(t, db, clientID)
		require.False(t, assigned,
			"куратор достался клиенту при регистрации — платная услуга отдана бесплатно")

		var conversations int
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM conversations WHERE client_id = $1`, clientID).Scan(&conversations))
		require.Zero(t, conversations,
			"переписка создана заранее: она сама выглядит приглашением писать тому, за кого не заплатили")
	}

	magicLinkFor := func(t *testing.T, db *database.DB, email string) string {
		t.Helper()
		plain, hashed, err := auth.NewTokenGenerator().GenerateToken()
		require.NoError(t, err)
		_, err = db.ExecContext(ctx, `
			INSERT INTO magic_links (token_hash, email, user_id, expires_at, consents)
			VALUES ($1, $2, NULL, $3, $4)`,
			hashed, email, time.Now().Add(time.Hour),
			[]byte(`{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`))
		require.NoError(t, err)
		return plain
	}

	t.Run("форма регистрации", func(t *testing.T) {
		db, service, _ := newFixture(t, "assign_path_form")

		result, err := service.Register(ctx,
			"by-form@example.test", "Str0ng-Passw0rd!", "Через форму", "127.0.0.1", "test",
			&auth.ConsentsInput{TermsOfService: true, PrivacyPolicy: true, DataProcessing: true})
		require.NoError(t, err)
		require.NotNil(t, result.User)

		requireNoCurator(t, db, result.User.ID)
	})

	t.Run("вход по одноразовой ссылке", func(t *testing.T) {
		db, service, _ := newFixture(t, "assign_path_magiclink")

		// Ссылка на ещё не существующий аккаунт: user_id пуст, адрес свой —
		// именно так её пишет RequestMagicLink для незнакомого адреса.
		plain := magicLinkFor(t, db, "by-link@example.test")

		result, _, err := service.ConsumeMagicLink(ctx, plain, "127.0.0.1", "test")
		require.NoError(t, err)
		require.NotNil(t, result.User)

		requireNoCurator(t, db, result.User.ID)
	})

	t.Run("вход через внешнего провайдера", func(t *testing.T) {
		db, service, _ := newFixture(t, "assign_path_provider")

		outcome, err := service.SignInWithProvider(ctx, "yandex", &oauth.Profile{
			ProviderUserID: "provider-user-1",
			Email:          "by-provider@example.test",
			Name:           "Через провайдера",
		}, "127.0.0.1", "test")
		require.NoError(t, err)
		require.NotNil(t, outcome.User, "провайдер не завёл аккаунт: %s", outcome.Result)

		requireNoCurator(t, db, outcome.User.User.ID)
	})

	t.Run("служебная учётка получает куратора бессрочно", func(t *testing.T) {
		db, service, _ := newFixture(t, "assign_path_service_account")
		// Служебный куратор в прогоне тоже есть; кого из двух незагруженных
		// выберет правило — здесь неважно и не проверяется: который именно
		// достаётся служебному клиенту, сторожит
		// TestAssignCuratorGivesTestCuratorToTestClient.
		addServiceCurator(t, db)

		plain := magicLinkFor(t, db, "e2e-client@burcev.team")

		result, _, err := service.ConsumeMagicLink(ctx, plain, "127.0.0.1", "test")
		require.NoError(t, err)
		require.NotNil(t, result.User)

		_, assigned := assignedCurator(t, db, result.User.ID)
		require.True(t, assigned, "без куратора набор сквозных проверок не пройдёт")

		var expires sql.NullTime
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT access_expires_at FROM curator_client_relationships
			  WHERE client_id = $1 AND status = 'active'`, result.User.ID).Scan(&expires))
		require.False(t, expires.Valid, "служебное право бессрочно, иначе прогон однажды встанет")
	})
}
