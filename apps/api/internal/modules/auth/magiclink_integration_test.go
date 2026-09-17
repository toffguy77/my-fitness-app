//go:build integration

package auth_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
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

// Регистр в базе и в запросе могут не совпадать — особенно после
// автоподстановки заглавной буквы на телефоне. Ссылка обязана найти аккаунт
// независимо от этого: RequestMagicLink ищет через LOWER(email) = LOWER($1),
// и только живая база проверяет, что это действительно совпадает без учёта
// регистра — sqlmock исполнил бы LOWER(...) как угодно, ему всё равно.
func TestRequestMagicLink_FindsAccountRegardlessOfCase(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink_case")
	ctx := context.Background()

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('CaseUser@Example.test', 'x', 'Кто-то', 'client')`)
	require.NoError(t, err)

	sender := &capturingSender{}
	service := auth.NewService(db.DB, &config.Config{}, logger.New()).WithEmailService(sender)
	consents := &auth.ConsentsInput{TermsOfService: true, PrivacyPolicy: true, DataProcessing: true}

	// Набрано не так, как хранится в users.
	require.NoError(t, service.RequestMagicLink(ctx, "caseuser@EXAMPLE.test", consents, "127.0.0.1", "test"))
	require.Len(t, sender.calls, 1, "письмо должно уйти ровно один раз — аккаунт найден, второго нет")

	var userID sql.NullInt64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT user_id FROM magic_links WHERE email = $1`, "caseuser@EXAMPLE.test").Scan(&userID))
	assert.True(t, userID.Valid, "аккаунт должен быть найден несмотря на другой регистр")
}

// Схема допускает пару аккаунтов, различающихся только регистром письма
// (users.email — TEXT UNIQUE, не CITEXT). QueryRowContext в таком случае
// молча вернул бы один из них — то есть выдал бы ссылку входа в аккаунт,
// который, возможно, не тот, о ком речь. RequestMagicLink обязан отказаться
// угадывать: не отправлять письмо и не писать строку — но вызывающему
// ответить тем же nil, что и при обычном успехе, иначе сам факт отказа
// выдал бы существование двойника.
func TestRequestMagicLink_AmbiguousCaseDoesNotGuess(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink_dup")
	ctx := context.Background()

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('dup@example.test', 'x', 'A', 'client')`)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('Dup@example.test', 'x', 'B', 'client')`)
	require.NoError(t, err)

	sender := &capturingSender{}
	service := auth.NewService(db.DB, &config.Config{}, logger.New()).WithEmailService(sender)
	consents := &auth.ConsentsInput{TermsOfService: true, PrivacyPolicy: true, DataProcessing: true}

	err = service.RequestMagicLink(ctx, "DUP@example.test", consents, "127.0.0.1", "test")
	require.NoError(t, err, "неоднозначность — не ошибка для вызывающего: ответ обязан остаться тем же общим успехом")

	assert.Empty(t, sender.calls, "письмо не должно уйти, если непонятно, кому из двоих")

	var count int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM magic_links WHERE LOWER(email) = LOWER($1)`, "DUP@example.test").Scan(&count))
	assert.Equal(t, 0, count, "строка не должна появиться в magic_links")
}

// postJSON sends a JSON body to path on r, mirroring the request-building
// helper the package's own handler tests use (internal/modules/auth's own
// `post`, not reachable from this external test package).
func postJSON(r *gin.Engine, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// Не только сервис отвечает одинаково при неоднозначности — сама HTTP-ручка
// обязана отдать тот же самый ответ, что и на обычный успех: иначе различие в
// коде ответа или в теле выдало бы существование пары адресов-двойников.
func TestRequestMagicLink_AmbiguousCaseAnswersLikeSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testsupport.SchemaWithMigrations(t, "magiclink_dup_http")
	ctx := context.Background()

	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('twin@example.test', 'x', 'A', 'client')`)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('Twin@example.test', 'x', 'B', 'client')`)
	require.NoError(t, err)

	sender := &capturingSender{}
	service := auth.NewService(db.DB, &config.Config{}, logger.New()).WithEmailService(sender)
	handler := auth.NewHandler(service, &config.Config{}, logger.New(), nil)

	router := gin.New()
	router.POST("/auth/magic-link/request", handler.RequestMagicLink)

	ambiguous := postJSON(router, "/auth/magic-link/request",
		`{"email":"TWIN@example.test","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	plain := postJSON(router, "/auth/magic-link/request",
		`{"email":"nobody-else@example.test","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	require.Equal(t, http.StatusOK, plain.Code)
	assert.Equal(t, plain.Code, ambiguous.Code)
	assert.Equal(t, plain.Body.String(), ambiguous.Body.String())

	// Письмо ушло только на однозначный адрес.
	require.Len(t, sender.calls, 1)
	assert.Equal(t, "nobody-else@example.test", sender.calls[0].UserEmail)
}
