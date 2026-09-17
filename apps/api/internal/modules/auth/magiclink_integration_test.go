//go:build integration

package auth_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/url"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// capturingSender records what it was asked to send, so a test can pull the
// plain token out of the link without a live SMTP server.
type capturingSender struct {
	calls []email.MagicLinkEmailData
}

func (c *capturingSender) SendMagicLink(ctx context.Context, data email.MagicLinkEmailData) error {
	c.calls = append(c.calls, data)
	return nil
}

func tokenFromMagicLinkURL(t *testing.T, rawURL string) string {
	t.Helper()
	parsed, err := url.Parse(rawURL)
	require.NoError(t, err)
	token := parsed.Query().Get("token")
	require.NotEmpty(t, token, "magic link URL carries no token: %s", rawURL)
	return token
}

// sqlmock проверяет, что запрос был выполнен, но не разбирает SQL — строка
// `$4::jsonb` для него ничем не отличается от строки, вставляющей мусор. Это
// проверяет ровно то, что подмена не может: что в magic_links действительно
// оказалась строка с правильным хэшем (не токеном), правильным сроком и
// правильными согласиями — только для нового аккаунта, не для существующего.
func TestRequestMagicLink_WritesLinkToDatabase(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink")
	ctx := context.Background()

	sender := &capturingSender{}
	service := auth.NewService(db.DB, &config.Config{}, logger.New()).WithEmailService(sender)

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('known@example.test', 'x', 'Кто-то', 'client')`)
	require.NoError(t, err)

	consents := &auth.ConsentsInput{TermsOfService: true, PrivacyPolicy: true, DataProcessing: true}

	require.NoError(t, service.RequestMagicLink(ctx, "known@example.test", consents, "127.0.0.1", "test"))
	require.NoError(t, service.RequestMagicLink(ctx, "stranger@example.test", consents, "127.0.0.1", "test"))
	require.Len(t, sender.calls, 2)

	t.Run("existing account", func(t *testing.T) {
		token := tokenFromMagicLinkURL(t, sender.calls[0].MagicLinkURL)

		var tokenHash string
		var userID sql.NullInt64
		var consentsJSON []byte
		var expiresAt time.Time
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT token_hash, user_id, consents, expires_at FROM magic_links WHERE email = $1`,
			"known@example.test").Scan(&tokenHash, &userID, &consentsJSON, &expiresAt))

		assert.NotEqual(t, token, tokenHash, "хранится хэш, а не сам токен")
		assert.NotContains(t, tokenHash, token, "хэш не должен содержать токен как подстроку")
		assert.True(t, userID.Valid, "у существующего адреса user_id должен быть заполнен")
		assert.Nil(t, consentsJSON, "согласия существующего аккаунта не перезаписываются")
		assert.WithinDuration(t, time.Now().Add(auth.MagicLinkTTL), expiresAt, 5*time.Second)
	})

	t.Run("new account", func(t *testing.T) {
		token := tokenFromMagicLinkURL(t, sender.calls[1].MagicLinkURL)

		var tokenHash string
		var userID sql.NullInt64
		var consentsJSON []byte
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT token_hash, user_id, consents FROM magic_links WHERE email = $1`,
			"stranger@example.test").Scan(&tokenHash, &userID, &consentsJSON))

		assert.NotEqual(t, token, tokenHash, "хранится хэш, а не сам токен")
		assert.NotContains(t, tokenHash, token, "хэш не должен содержать токен как подстроку")
		assert.False(t, userID.Valid, "у нового адреса user_id должен быть пуст")

		require.NotEmpty(t, consentsJSON, "согласия нового аккаунта должны быть записаны")
		var stored auth.ConsentsInput
		require.NoError(t, json.Unmarshal(consentsJSON, &stored))
		assert.Equal(t, *consents, stored)
	})
}
