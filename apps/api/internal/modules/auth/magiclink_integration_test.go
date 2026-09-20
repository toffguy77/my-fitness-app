//go:build integration

package auth_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/shared/apperrors"
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

// seedMagicLink вставляет строку magic_links напрямую, минуя RequestMagicLink:
// этому тесту нужна ссылка на уже существующего пользователя с известным
// открытым токеном, а не письмо.
func seedMagicLink(t *testing.T, db *sql.DB, tokenGen *auth.TokenGenerator, userID int64, expiresAt time.Time) string {
	t.Helper()
	plainToken, hashedToken, err := tokenGen.GenerateToken()
	require.NoError(t, err)

	_, err = db.ExecContext(context.Background(), `
		INSERT INTO magic_links (token_hash, email, user_id, expires_at)
		VALUES ($1, 'concurrent@example.test', $2, $3)`,
		hashedToken, userID, expiresAt)
	require.NoError(t, err)

	return plainToken
}

// Одноразовость проверяется на настоящей базе намеренно. На sqlmock «второй
// переход не выдаёт сессию» проходит и тогда, когда погашение написано как
// чтение с последующей записью без условия: подмена не спотыкается на гонке,
// а именно она здесь и опасна — две вкладки, открытые из одного письма.
func TestConsumeMagicLinkIsSingleUseUnderConcurrency(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink_race")
	ctx := context.Background()
	svc := auth.NewService(db.DB, &config.Config{}, logger.New())

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('concurrent@example.test', 'x', 'Кто-то', 'client') RETURNING id`).
		Scan(&userID))

	token := seedMagicLink(t, db.DB, auth.NewTokenGenerator(), userID, time.Now().Add(time.Minute))

	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			_, _, err := svc.ConsumeMagicLink(context.Background(), token, "127.0.0.1", "test")
			results <- err
		}()
	}

	var ok, failed int
	for i := 0; i < 2; i++ {
		if err := <-results; err == nil {
			ok++
		} else {
			failed++
		}
	}

	assert.Equal(t, 1, ok, "ровно один переход обязан выдать сессию")
	assert.Equal(t, 1, failed)
}

// seedMagicLinkWithConsents вставляет непогашенную ссылку на адрес без
// аккаунта, с согласиями — как их записал бы RequestMagicLink. В отличие от
// seedMagicLink, user_id здесь NULL: это ветка createAccountFromMagicLink,
// а не issueTokensForUser.
func seedMagicLinkWithConsents(t *testing.T, db *sql.DB, tokenGen *auth.TokenGenerator, recipientEmail, consentsJSON string) string {
	t.Helper()
	plainToken, hashedToken, err := tokenGen.GenerateToken()
	require.NoError(t, err)

	_, err = db.ExecContext(context.Background(), `
		INSERT INTO magic_links (token_hash, email, user_id, consents, expires_at)
		VALUES ($1, $2, NULL, $3::jsonb, $4)`,
		hashedToken, recipientEmail, consentsJSON, time.Now().Add(time.Minute))
	require.NoError(t, err)

	return plainToken
}

// Обычная регистрация пишет согласия в user_consents (service.go, storeConsents).
// Путь по ссылке — в обход неё — дал бы пользователей без единой записи о
// согласии; на sqlmock это было бы незаметно, потому что подмена не хранит
// строк.
func TestMagicLinkAccountRecordsConsents(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink_consents")
	ctx := context.Background()
	svc := auth.NewService(db.DB, &config.Config{}, logger.New())

	token := seedMagicLinkWithConsents(t, db.DB, auth.NewTokenGenerator(), "fresh@example.test",
		`{"terms_of_service":true,"privacy_policy":true,"data_processing":true,"marketing":false}`)

	result, created, err := svc.ConsumeMagicLink(ctx, token, "127.0.0.1", "test")
	require.NoError(t, err)
	require.True(t, created)

	rows, err := db.QueryContext(ctx,
		`SELECT consent_type, granted FROM user_consents WHERE user_id = $1 ORDER BY consent_type`,
		result.User.ID)
	require.NoError(t, err)
	defer rows.Close()

	granted := map[string]bool{}
	for rows.Next() {
		var ctype string
		var ok bool
		require.NoError(t, rows.Scan(&ctype, &ok))
		granted[ctype] = ok
	}
	require.NoError(t, rows.Err())

	assert.Len(t, granted, 4, "должны быть записаны все четыре согласия")
	assert.True(t, granted["terms_of_service"])
	assert.True(t, granted["privacy_policy"])
	assert.True(t, granted["data_processing"])
	assert.False(t, granted["marketing"])
}

// seedLead сохраняет заявку с ростом и весом через настоящий leads.Service —
// не вставкой в таблицу leads напрямую, чтобы тест прошёл через тот же путь,
// которым заявка попадает в базу в проде (включая запись её согласий).
func seedLead(t *testing.T, leadsSvc *leads.Service, leadEmail string, heightCm, weightKg float64) string {
	t.Helper()
	_, token, err := leadsSvc.Create(context.Background(), leads.CreateInput{
		Email: leadEmail,
		Parameters: leads.Parameters{
			HeightCm: &heightCm,
			WeightKg: &weightKg,
		},
		Consents: leads.Consents{DataProcessing: true, Contact: true},
	}, "127.0.0.1", "test")
	require.NoError(t, err)
	return token
}

// Адрес, на который пришла ссылка, подтверждён самим переходом по ней —
// второе письмо с кодом не нужно. А рост и вес, которые человек ввёл в
// заявке до регистрации, не должны спрашиваться второй раз: они обязаны
// оказаться в user_settings и daily_metrics после переноса заявки.
//
// Перенос заявки — дело обработчика (h.claimLead в handler.go), не сервиса
// auth: здесь он воспроизводится тем же вызовом, leads.Service.ClaimInto,
// которым его делает ConsumeMagicLink-хендлер.
func TestMagicLinkAccountIsVerifiedAndClaimsLead(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink_lead")
	ctx := context.Background()
	svc := auth.NewService(db.DB, &config.Config{}, logger.New())
	leadsSvc := leads.NewService(db.DB, logger.New(), "test-secret")

	leadToken := seedLead(t, leadsSvc, "fresh2@example.test", 178.0, 82.5)
	token := seedMagicLinkWithConsents(t, db.DB, auth.NewTokenGenerator(), "fresh2@example.test",
		`{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`)

	result, created, err := svc.ConsumeMagicLink(ctx, token, "127.0.0.1", "test")
	require.NoError(t, err)
	require.True(t, created)

	require.NoError(t, leadsSvc.ClaimInto(ctx, leadToken, result.User.ID))

	var verified bool
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT email_verified FROM users WHERE id = $1`, result.User.ID).Scan(&verified))
	assert.True(t, verified, "адрес подтверждён самим переходом по ссылке")

	// Рост и вес из заявки — в user_settings.height и daily_metrics.weight:
	// таблицы user_profiles в схеме нет.
	var height sql.NullFloat64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT height FROM user_settings WHERE user_id = $1`, result.User.ID).Scan(&height))
	require.True(t, height.Valid)
	assert.InDelta(t, 178.0, height.Float64, 0.01)

	var weight sql.NullFloat64
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT weight FROM daily_metrics WHERE user_id = $1 AND date = CURRENT_DATE`,
		result.User.ID).Scan(&weight))
	require.True(t, weight.Valid)
	assert.InDelta(t, 82.5, weight.Float64, 0.01)
}

// leads.Claim переносит согласия заявки, меняя владельца строки
// (UPDATE user_consents SET user_id = ..., lead_id = NULL WHERE lead_id = ...),
// а не копируя их поверх новых. Ничто в этой задаче это не меняет — тест
// охраняет свойство от будущей правки, которая заменит UPDATE на INSERT и
// задвоит согласия каждому, кто регистрируется из заявки.
func TestLeadClaimMovesConsentsWithoutDuplicating(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink_lead_consents")
	ctx := context.Background()
	svc := auth.NewService(db.DB, &config.Config{}, logger.New())
	leadsSvc := leads.NewService(db.DB, logger.New(), "test-secret")

	leadToken := seedLead(t, leadsSvc, "fresh3@example.test", 170.0, 60.0)

	var leadRowsBefore int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM user_consents WHERE lead_id IS NOT NULL`).Scan(&leadRowsBefore))
	require.Equal(t, 2, leadRowsBefore, "заявка должна записать оба своих согласия")

	token := seedMagicLinkWithConsents(t, db.DB, auth.NewTokenGenerator(), "fresh3@example.test",
		`{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`)

	result, created, err := svc.ConsumeMagicLink(ctx, token, "127.0.0.1", "test")
	require.NoError(t, err)
	require.True(t, created)

	// До переноса: 4 согласия аккаунта (storeConsents всегда пишет все
	// четыре типа, включая отказы) + 2 согласия заявки.
	var totalBeforeClaim int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM user_consents WHERE user_id = $1 OR lead_id IS NOT NULL`,
		result.User.ID).Scan(&totalBeforeClaim))
	require.Equal(t, 6, totalBeforeClaim)

	require.NoError(t, leadsSvc.ClaimInto(ctx, leadToken, result.User.ID))

	var leadRowsAfter int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM user_consents WHERE lead_id IS NOT NULL`).Scan(&leadRowsAfter))
	assert.Equal(t, 0, leadRowsAfter, "у перенесённой заявки не должно остаться строк с lead_id")

	var totalAfterClaim int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM user_consents WHERE user_id = $1`, result.User.ID).Scan(&totalAfterClaim))
	assert.Equal(t, 6, totalAfterClaim, "перенос меняет владельца строк, а не копирует их — то же количество, что и до переноса")
}

// createAccountFromMagicLink должна отличать гонку на уникальности адреса
// (аккаунт завели другим путём между выдачей ссылки и переходом по ней) от
// прочих отказов базы: обработчик ConsumeMagicLink разбирает ошибки через
// errors.Is с apperrors и отправляет всё неизвестное в default — то есть в
// 500 с логом, а не в понятный ответ.
func TestMagicLinkAccountConflictWhenAddressTakenDuringRace(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink_conflict")
	ctx := context.Background()
	svc := auth.NewService(db.DB, &config.Config{}, logger.New())

	token := seedMagicLinkWithConsents(t, db.DB, auth.NewTokenGenerator(), "raced@example.test",
		`{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`)

	// Имитируем гонку: пока ссылка обрабатывалась, кто-то завёл аккаунт на
	// этот же адрес другим путём (например, паролем).
	_, err := db.ExecContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('raced@example.test', 'x', 'Кто-то', 'client')`)
	require.NoError(t, err)

	_, _, err = svc.ConsumeMagicLink(ctx, token, "127.0.0.1", "test")
	require.Error(t, err)
	assert.True(t, errors.Is(err, apperrors.ErrConflict),
		"отказ обязан быть распознаваемым сентинелом, а не голой ошибкой базы")
}

// Вставка пользователя и вставка user_settings — одна транзакция: если
// вторая ломается, первая обязана откатиться. Это не самопроверяющееся на
// подмене свойство — sqlmock не умеет ответить, что осталось в базе после
// отката, поэтому здесь настоящий Postgres и настоящая поломка второй
// вставки (переименование таблицы user_settings делает её INSERT
// невозможным детерминированно, без гонок с таймингом).
//
// Важность: без атомарности несостоявшийся аккаунт не самоисправляется —
// следующий переход по новой ссылке для того же адреса нашёл бы userID и
// ушёл прямо в issueTokensForUser, минуя createAccountFromMagicLink и его
// вставку user_settings и согласий, целиком.
func TestMagicLinkAccountFailurePartwayLeavesNoUser(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "magiclink_partial")
	ctx := context.Background()
	svc := auth.NewService(db.DB, &config.Config{}, logger.New())

	token := seedMagicLinkWithConsents(t, db.DB, auth.NewTokenGenerator(), "partial@example.test",
		`{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`)

	// Ломаем вторую вставку CHECK-ограничением на локальной таблице этой
	// тестовой схемы, а не переименованием/удалением таблицы: search_path
	// здесь — "схема_теста,public", и у "public" в этой базе есть собственная
	// полноценная копия схемы (используется E2E-сидом). Переименование или
	// снос user_settings в тестовой схеме заставило бы INSERT найти
	// "user_settings" через public — то есть записать строку в общую,
	// используемую вне тестов таблицу. CHECK(false) не убирает таблицу из
	// схемы, поэтому такого провала через public не происходит: INSERT
	// находит ровно ту же локальную таблицу и просто ломается на ограничении.
	_, err := db.ExecContext(ctx,
		`ALTER TABLE user_settings ADD CONSTRAINT force_test_failure CHECK (false)`)
	require.NoError(t, err)

	_, _, err = svc.ConsumeMagicLink(ctx, token, "127.0.0.1", "test")
	require.Error(t, err, "без user_settings вставка обязана провалиться, а не тихо пройти")

	var count int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM users WHERE email = $1`, "partial@example.test").Scan(&count))
	assert.Equal(t, 0, count,
		"падение внутри транзакции не должно оставлять пользователя без строки настроек")
}
