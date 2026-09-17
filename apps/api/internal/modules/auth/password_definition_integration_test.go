//go:build integration

package auth_test

import (
	"context"
	"errors"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Проверяется на живой базе намеренно: sqlmock отдаёт ровно ту пустую
// строку, которую ему велят вернуть, для любого запроса — то есть три
// разных SQL-запроса на подмене могли бы "согласиться" друг с другом просто
// потому, что тест сам вписал одинаковый ответ в каждое место отдельно.
// Живая база — одна настоящая строка в users.password = ”, и три разных
// вызова читают её сами, каждый своим запросом.
//
// До PasswordIsSet у "есть пароль" было три определения на одно и то же
// значение: HasPassword и ConfirmLinkWithPassword считали пустую строку
// паролем, RequestDeletion — не считал. Для аккаунта с password = ” это
// означало: /auth/me отдаёт has_password: true, форма показывает поле
// пароля и никогда не покажет код, а RequestDeletion уходит в ветку для
// беспарольного и требует именно код — аккаунт становится неудаляемым
// через форму навсегда.
func TestPasswordDefinitionAgreesAcrossEveryCaller(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "password_definition")
	ctx := context.Background()

	var userID int64
	const userEmail = "empty-password@example.test"
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ($1, '', 'Кто-то', 'client', NOW(), NOW())
		 RETURNING id`, userEmail).Scan(&userID))

	authSvc := auth.NewService(db.DB, &config.Config{}, logger.New())
	accountSvc := account.NewService(db, logger.New(), nil)

	t.Run("HasPassword says no", func(t *testing.T) {
		has, err := authSvc.HasPassword(ctx, userID)
		require.NoError(t, err)
		assert.False(t, has, "пустая строка не должна считаться паролем")
	})

	t.Run("RequestDeletion asks for a code, not a password", func(t *testing.T) {
		_, err := accountSvc.RequestDeletion(ctx, userID, "", "")
		require.Error(t, err)
		// ErrValidation ("нужен код") — ветка для беспарольного аккаунта.
		// ErrInvalidCredentials ("неверный пароль") означало бы, что этот
		// путь до сих пор считает пустую строку паролем и пытался её
		// сравнить bcrypt'ом.
		assert.True(t, errors.Is(err, apperrors.ErrValidation),
			"пустой пароль должен направить в ветку кода, а не в сравнение bcrypt: %v", err)
	})

	t.Run("ConfirmLinkWithPassword refuses instead of comparing bcrypt", func(t *testing.T) {
		var pendingID string
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO oauth_pending_links (provider, provider_user_id, email, expires_at)
			 VALUES ('yandex', 'ext-1', $1, NOW() + '15 minutes'::interval)
			 RETURNING id`, userEmail).Scan(&pendingID))

		_, err := authSvc.ConfirmLinkWithPassword(ctx, pendingID, "anything", "127.0.0.1", "test")
		require.Error(t, err)
		// ErrConflict ("нечего проверять паролем"). ErrInvalidCredentials
		// здесь означало бы, что bcrypt.CompareHashAndPassword уже позвали
		// на пустую строку и она провалилась как "неверный пароль" —
		// технически отказ, но не тот, который означает "у аккаунта нет
		// пароля".
		assert.True(t, errors.Is(err, apperrors.ErrConflict),
			"пустая строка должна отказать до сравнения bcrypt: %v", err)
	})
}
