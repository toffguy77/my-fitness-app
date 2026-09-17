//go:build integration

package account_test

import (
	"context"
	"errors"
	"testing"

	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Проверяется на живой базе намеренно: NULL в password не воспроизводится на
// sqlmock (оно отдаёт ровно то, что ему велено, и про NULL в столбце ничего
// не знает). RequestDeletion читал пароль в string тем же способом, каким это
// делал Login до соседней правки: для аккаунта, заведённого через внешнего
// провайдера или по ссылке входа (password = NULL), Scan падал с
// "converting NULL to string is unsupported", и удаление собственного
// аккаунта было полностью сломано в проде для всех таких пользователей.
func TestRequestDeletionForPasswordlessAccount(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "account_deletion_passwordless")
	ctx := context.Background()
	service := account.NewService(db, logger.New(), nil)

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, created_at, updated_at)
		 VALUES ('passwordless-deletion@example.test', NULL, 'Кто-то', 'client', NOW(), NOW())
		 RETURNING id`).Scan(&userID))

	status, err := service.RequestDeletion(ctx, userID, "")

	require.NoError(t, err,
		"у беспарольного аккаунта запрос на удаление не должен падать внутренней ошибкой")
	require.NotNil(t, status)
	assert.True(t, status.Requested)
	assert.False(t, errors.Is(err, apperrors.ErrInvalidCredentials))
}
