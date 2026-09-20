//go:build integration

package auth_test

import (
	"context"
	"errors"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Проверяется на живой базе намеренно: оба дефекта — про то, что приходит из
// базы, а sqlmock отдаёт ровно то, что ему сказали отдать, и про NULL в
// столбце не знает ничего. Дефект B (NULL в password даёт внутреннюю ошибку
// вместо "неверные учётные данные") и обнаружился только на живой базе.
func TestLoginAgainstRealPasswordlessRows(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "auth_login_passwordless")
	ctx := context.Background()

	svc := auth.NewService(db.DB, &config.Config{
		JWTSecret: "integration-secret-that-is-long-enough-32",
	}, logger.New())

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('null@example.test', NULL, 'Кто-то', 'client')`)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('empty@example.test', '', 'Кто-то ещё', 'client')`)
	require.NoError(t, err)

	_, errNull := svc.Login(ctx, "null@example.test", "", "ip", "ua", false)
	_, errEmpty := svc.Login(ctx, "empty@example.test", "", "ip", "ua", false)

	assert.True(t, errors.Is(errNull, apperrors.ErrInvalidCredentials),
		"NULL-пароль обязан давать отказ, а не внутреннюю ошибку: %v", errNull)
	assert.True(t, errors.Is(errEmpty, apperrors.ErrInvalidCredentials),
		"пустой пароль обязан давать отказ, а не вход: %v", errEmpty)
}
