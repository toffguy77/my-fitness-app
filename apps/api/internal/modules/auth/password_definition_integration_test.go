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

// Проверяется на живой базе намеренно: sqlmock отдаёт ровно то значение,
// которое ему велят вернуть, для любого запроса — то есть шесть разных
// SQL-запросов на подмене могли бы согласиться друг с другом просто потому,
// что тест сам вписал одинаковый ответ в каждое место отдельно. Живая база —
// одна настоящая строка в users.password (пустая строка, не NULL), плюс одна
// строка в external_identities для UnlinkProvider и одна в oauth_pending_links
// для ConfirmLinkWithPassword, и шесть разных вызовов читают эти строки сами,
// каждый своим запросом.
//
// До PasswordIsSet "есть пароль" было выражено шестью разными способами:
// HasPassword, ConfirmLinkWithPassword и UnlinkProvider считали пустую строку
// паролем; RequestDeletion, Login и ChangePassword — не считали. Для
// аккаунта с пустой строкой в password и одной привязкой провайдера это
// означало: /auth/me отдаёт has_password: true, форма никогда не покажет код
// для удаления, а отвязка последнего способа входа проходит без отказа —
// человек запирает себя снаружи навсегда. Login и ChangePassword были
// написаны верно и до этой правки, но параллельным выражением того же
// правила — именно параллельность и породила расхождения в трёх других
// местах.
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

	t.Run("Login refuses without leaking a NULL-scan crash", func(t *testing.T) {
		_, err := authSvc.Login(ctx, userEmail, "anything", "127.0.0.1", "test", false)
		require.Error(t, err)
		assert.True(t, errors.Is(err, apperrors.ErrInvalidCredentials),
			"пустой пароль не должен уходить в bcrypt-сравнение так, будто это настоящий хэш: %v", err)
	})

	t.Run("ChangePassword refuses instead of comparing bcrypt", func(t *testing.T) {
		err := authSvc.ChangePassword(ctx, userID, "anything", "NewPassword2@", &auth.LoginResult{})
		require.Error(t, err)
		// ErrConflict ("нечего менять"). ErrInvalidCredentials здесь означало
		// бы, что bcrypt.CompareHashAndPassword уже позвали на пустую строку —
		// тот же неверный ответ, что чинили в остальных пяти местах.
		assert.True(t, errors.Is(err, apperrors.ErrConflict),
			"пустая строка должна отказать до сравнения bcrypt: %v", err)
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

	t.Run("UnlinkProvider refuses to remove the only sign-in method", func(t *testing.T) {
		_, err := db.ExecContext(ctx,
			`INSERT INTO external_identities (user_id, provider, provider_user_id, email)
			 VALUES ($1, 'yandex', 'ext-only', $2)`, userID, userEmail)
		require.NoError(t, err)

		unlinkErr := authSvc.UnlinkProvider(ctx, userID, "yandex")
		require.Error(t, unlinkErr,
			"единственная привязка провайдера у аккаунта без пароля не должна сниматься")
		assert.True(t, errors.Is(unlinkErr, apperrors.ErrConflict),
			"пустая строка должна означать отсутствие пароля, а не молча пропустить проверку: %v", unlinkErr)
	})
}
