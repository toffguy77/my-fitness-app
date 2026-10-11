//go:build integration

package auth_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func challengeFor(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// Вход через провайдера из приложения: код меняется на сессию только вместе
// с секретом приложения и только один раз. Код, перехваченный по дороге из
// браузера в приложение, без секрета ничего не даёт.
func TestAppHandoff(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "oauth_app")
	ctx := context.Background()
	service := auth.NewService(db.DB, &config.Config{JWTSecret: "test-secret-test-secret-test-secret"}, logger.New())

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('яндекс@e.test', 'x', 'Я', 'client') RETURNING id`).Scan(&userID))

	verifier := "секрет-приложения-достаточно-длинный-0123456789"
	code, err := service.CreateAppHandoff(ctx, userID, challengeFor(verifier))
	require.NoError(t, err)

	t.Run("чужой секрет не подходит и сжигает код", func(t *testing.T) {
		stolen, err := service.CreateAppHandoff(ctx, userID, challengeFor(verifier))
		require.NoError(t, err)
		_, err = service.ExchangeAppHandoff(ctx, stolen, "не тот секрет", "", "")
		require.ErrorIs(t, err, apperrors.ErrUnauthorized)
		_, err = service.ExchangeAppHandoff(ctx, stolen, verifier, "", "")
		require.ErrorIs(t, err, apperrors.ErrUnauthorized, "код пережил попытку с чужим секретом")
	})

	result, err := service.ExchangeAppHandoff(ctx, code, verifier, "", "")
	require.NoError(t, err)
	assert.Equal(t, userID, result.User.ID)
	assert.NotEmpty(t, result.Token)
	assert.NotEmpty(t, result.RefreshToken)

	_, err = service.ExchangeAppHandoff(ctx, code, verifier, "", "")
	require.ErrorIs(t, err, apperrors.ErrUnauthorized, "код сработал дважды")

	t.Run("просроченный код не принимается", func(t *testing.T) {
		late, err := service.CreateAppHandoff(ctx, userID, challengeFor(verifier))
		require.NoError(t, err)
		_, err = db.ExecContext(ctx, `UPDATE oauth_app_handoffs SET expires_at = NOW() - INTERVAL '1 second'`)
		require.NoError(t, err)
		_, err = service.ExchangeAppHandoff(ctx, late, verifier, "", "")
		require.ErrorIs(t, err, apperrors.ErrUnauthorized)
	})
}
