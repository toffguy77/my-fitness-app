//go:build integration

package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// Аккаунт через провайдера создаётся после согласий (external-identity).
//
// Поток прогоняется целиком — колбэк, экран согласий, — через обработчики и на
// настоящей базе: вопрос «создан ли аккаунт» и «есть ли строки согласий»
// задаётся строкам, а подмена ответила бы на него как угодно.

// fakeProvider stands in for Yandex: it hands back a fixed profile for any code.
type fakeProvider struct {
	name    string
	profile oauth.Profile
}

func (p fakeProvider) Name() string { return p.name }
func (p fakeProvider) AuthorizationURL(state, _, _ string) string {
	return "https://provider.example/authorize?state=" + state
}
func (p fakeProvider) Exchange(context.Context, oauth.ExchangeRequest) (*oauth.Profile, error) {
	profile := p.profile
	return &profile, nil
}

type consentsFlow struct {
	db       *database.DB
	engine   *gin.Engine
	provider string
}

func newConsentsFlow(t *testing.T, name string, profile oauth.Profile) consentsFlow {
	return newProviderFlow(t, name, "yandex", profile)
}

func newProviderFlow(t *testing.T, name, provider string, profile oauth.Profile) consentsFlow {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, name)
	cfg := &config.Config{AppDomain: "app.example.com"}
	log := logger.New()
	service := auth.NewService(db.DB, cfg, log)

	registry := oauth.NewRegistry()
	registry.Register(fakeProvider{name: provider, profile: profile})
	h := auth.NewOAuthHandler(cfg, log, service, registry)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/v1/auth/oauth/:provider/callback", h.Callback)
	r.POST("/api/v1/auth/oauth/consents", h.CompleteConsents)
	r.POST("/api/v1/auth/oauth/email", h.CompleteEmail)
	r.POST("/api/v1/auth/oauth/link", h.ConfirmLink)
	return consentsFlow{db: db, engine: r, provider: provider}
}

// callback returns as if the provider had redirected back to us.
func (f consentsFlow) callback(t *testing.T) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/"+f.provider+"/callback?code=c&state=s", nil)
	req.AddCookie(&http.Cookie{Name: "oauth_state", Value: "s"})
	req.AddCookie(&http.Cookie{Name: "oauth_verifier", Value: "v"})
	req.AddCookie(&http.Cookie{Name: "oauth_provider", Value: f.provider})
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusFound, w.Code)
	return w.Result()
}

func (f consentsFlow) consents(t *testing.T, pending *http.Cookie, body string) *http.Response {
	t.Helper()
	return f.post(t, "/api/v1/auth/oauth/consents", pending, body)
}

func (f consentsFlow) post(t *testing.T, path string, pending *http.Cookie, body string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if pending != nil {
		req.AddCookie(pending)
	}
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, req)
	return w.Result()
}

func liveCookie(res *http.Response, name string) *http.Cookie {
	for _, c := range res.Cookies() {
		if c.Name == name && c.MaxAge >= 0 && c.Value != "" {
			return c
		}
	}
	return nil
}

func expiredCookie(res *http.Response, name string) bool {
	for _, c := range res.Cookies() {
		if c.Name == name && c.MaxAge < 0 {
			return true
		}
	}
	return false
}

func (f consentsFlow) users(t *testing.T, email string) int {
	t.Helper()
	var n int
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM users WHERE email = $1`, email).Scan(&n))
	return n
}

func (f consentsFlow) grantedConsents(t *testing.T, userID int64) []string {
	t.Helper()
	rows, err := f.db.QueryContext(context.Background(),
		`SELECT consent_type FROM user_consents WHERE user_id = $1 AND granted ORDER BY consent_type`, userID)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()
	var types []string
	for rows.Next() {
		var ct string
		require.NoError(t, rows.Scan(&ct))
		types = append(types, ct)
	}
	require.NoError(t, rows.Err())
	return types
}

const allConsents = `{"consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true,"marketing":false}}`

var mandatory = []string{"data_processing", "privacy_policy", "terms_of_service"}

func TestProviderSignUp_WaitsForConsents(t *testing.T) {
	const email = "new-by-yandex@example.test"
	f := newConsentsFlow(t, "oauth_consents_new", oauth.Profile{
		ProviderUserID: "ya-1001", Email: email, Name: "Новый",
	})

	res := f.callback(t)

	// Колбэк уводит на экран согласий, аккаунта нет.
	location, err := url.Parse(res.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "https", location.Scheme)
	assert.Equal(t, "app.example.com", location.Host)
	assert.Equal(t, "/auth/consents", location.Path)
	assert.Equal(t, "yandex", location.Query().Get("provider"))
	assert.Zero(t, f.users(t, email), "аккаунт создан до согласий")
	assert.Nil(t, liveCookie(res, "refresh_token"), "сессия выдана до согласий")

	pending := liveCookie(res, "oauth_pending")
	require.NotNil(t, pending, "ожидающий вход не запаркован")
	assert.Equal(t, "/api/v1/auth", pending.Path)
	assert.True(t, pending.HttpOnly)

	t.Run("без согласия на обработку данных", func(t *testing.T) {
		res := f.consents(t, pending,
			`{"consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":false}}`)

		assert.Equal(t, http.StatusBadRequest, res.StatusCode)
		assert.Zero(t, f.users(t, email), "аккаунт создан без согласия на обработку данных")
	})

	t.Run("с обязательными согласиями", func(t *testing.T) {
		res := f.consents(t, pending, allConsents)

		require.Equal(t, http.StatusOK, res.StatusCode)
		var userID int64
		require.NoError(t, f.db.QueryRowContext(context.Background(),
			`SELECT id FROM users WHERE email = $1 AND email_verified`, email).Scan(&userID))
		assert.Equal(t, mandatory, f.grantedConsents(t, userID))

		var linked int
		require.NoError(t, f.db.QueryRowContext(context.Background(),
			`SELECT COUNT(*) FROM external_identities WHERE user_id = $1 AND provider = 'yandex'`, userID).Scan(&linked))
		assert.Equal(t, 1, linked)

		// Сессия — как у остальных шагов: refresh-токен в HttpOnly-cookie.
		refresh := liveCookie(res, "refresh_token")
		require.NotNil(t, refresh, "сессия не выдана")
		assert.True(t, refresh.HttpOnly)
		assert.NotNil(t, liveCookie(res, "session_present"))
		assert.True(t, expiredCookie(res, "oauth_pending"), "ожидающий вход не снят")

		var left int
		require.NoError(t, f.db.QueryRowContext(context.Background(),
			`SELECT COUNT(*) FROM oauth_pending_links`).Scan(&left))
		assert.Zero(t, left, "попытка пережила своё завершение")
	})

	t.Run("попытку нельзя завершить дважды", func(t *testing.T) {
		res := f.consents(t, pending, allConsents)
		assert.Equal(t, http.StatusBadRequest, res.StatusCode)
	})

	t.Run("повторный вход привязанного пользователя", func(t *testing.T) {
		res := f.callback(t)

		location, err := url.Parse(res.Header.Get("Location"))
		require.NoError(t, err)
		assert.Equal(t, "/auth/complete", location.Path, "экрана согласий у давшего их нет")
		assert.Equal(t, "signed_in", location.Query().Get("result"))
		assert.NotNil(t, liveCookie(res, "refresh_token"), "сессия выдаётся сразу")
		assert.Nil(t, liveCookie(res, "oauth_pending"))
	})
}

// 4.2: аккаунт, заведённый через провайдера до того, как спрашивали согласия,
// при следующем входе проходит тот же экран.
func TestProviderSignIn_AccountWithoutConsentsPassesTheScreen(t *testing.T) {
	ctx := context.Background()
	const email = "old-by-yandex@example.test"
	f := newConsentsFlow(t, "oauth_consents_legacy", oauth.Profile{
		ProviderUserID: "ya-2002", Email: email, Name: "Старый",
	})

	var userID int64
	require.NoError(t, f.db.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified, onboarding_completed)
		VALUES ($1, NULL, 'Старый', 'client', true, true) RETURNING id`, email).Scan(&userID))
	_, err := f.db.ExecContext(ctx, `
		INSERT INTO external_identities (user_id, provider, provider_user_id, email)
		VALUES ($1, 'yandex', 'ya-2002', $2)`, userID, email)
	require.NoError(t, err)
	require.Empty(t, f.grantedConsents(t, userID), "у пользователя не должно быть строк user_consents")

	res := f.callback(t)

	location, err := url.Parse(res.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "/auth/consents", location.Path)
	assert.Nil(t, liveCookie(res, "refresh_token"), "сессия выдана без согласий")
	pending := liveCookie(res, "oauth_pending")
	require.NotNil(t, pending)

	res = f.consents(t, pending, allConsents)

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.NotNil(t, liveCookie(res, "refresh_token"))
	assert.Equal(t, mandatory, f.grantedConsents(t, userID))
	assert.Equal(t, 1, f.users(t, email), "второй аккаунт на тот же адрес")

	// Дальше — без экрана.
	res = f.callback(t)
	location, err = url.Parse(res.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "/auth/complete", location.Path)
}

// Отзыв обязательного согласия (более поздняя строка granted = false) весит
// больше прежнего согласия: журнал читается по последней записи.
func TestProviderSignIn_RevokedConsentCountsAsMissing(t *testing.T) {
	ctx := context.Background()
	const email = "revoked@example.test"
	f := newConsentsFlow(t, "oauth_consents_revoked", oauth.Profile{
		ProviderUserID: "ya-3003", Email: email,
	})

	var userID int64
	require.NoError(t, f.db.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified)
		VALUES ($1, NULL, 'Отозвал', 'client', true) RETURNING id`, email).Scan(&userID))
	_, err := f.db.ExecContext(ctx, `
		INSERT INTO external_identities (user_id, provider, provider_user_id, email)
		VALUES ($1, 'yandex', 'ya-3003', $2)`, userID, email)
	require.NoError(t, err)
	_, err = f.db.ExecContext(ctx, `
		INSERT INTO user_consents (user_id, consent_type, granted, granted_at) VALUES
		  ($1, 'terms_of_service', true, NOW() - INTERVAL '2 days'),
		  ($1, 'privacy_policy',   true, NOW() - INTERVAL '2 days'),
		  ($1, 'data_processing',  true, NOW() - INTERVAL '2 days'),
		  ($1, 'data_processing',  false, NOW() - INTERVAL '1 day')`, userID)
	require.NoError(t, err)

	res := f.callback(t)

	location, err := url.Parse(res.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "/auth/consents", location.Path)
}

func decode(t *testing.T, res *http.Response) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.NewDecoder(res.Body).Decode(&body))
	return body
}

// Провайдер не отдал адрес (так делает VK): человек вводит его сам. Аккаунт
// не создаётся ни на этом шаге, ни раньше — только после согласий, и
// начинается неподтверждённым: адрес никто не подтверждал.
func TestProviderWithoutEmail_TypedAddressWaitsForConsents(t *testing.T) {
	ctx := context.Background()
	const email = "e2e-vk-typed@burcev.team"
	f := newProviderFlow(t, "oauth_consents_vk", "vk", oauth.Profile{
		ProviderUserID: "vk-4004", Name: "Без адреса",
	})
	// Служебный клиент получает служебного куратора: так видно, что назначение
	// на этом пути действительно вызывается (живому клиенту куратор не
	// назначается ни на одном пути).
	var curatorID int64
	require.NoError(t, f.db.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified)
		VALUES ('curator@burcev.test', 'x', 'Служебный', 'coordinator', true) RETURNING id`).Scan(&curatorID))

	res := f.callback(t)
	location, err := url.Parse(res.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "/auth/email", location.Path)
	pending := liveCookie(res, "oauth_pending")
	require.NotNil(t, pending)

	res = f.post(t, "/api/v1/auth/oauth/email", pending, `{"email":"`+email+`"}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.Equal(t, map[string]any{"result": "needs_consents"}, decode(t, res)["data"])
	assert.Zero(t, f.users(t, email), "аккаунт создан до согласий")
	assert.Nil(t, liveCookie(res, "refresh_token"), "сессия выдана до согласий")
	assert.False(t, expiredCookie(res, "oauth_pending"), "попытка нужна шагу согласий")

	var stored string
	var fromProvider bool
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT email, email_from_provider FROM oauth_pending_links`).Scan(&stored, &fromProvider))
	assert.Equal(t, email, stored)
	assert.False(t, fromProvider, "введённый адрес отмечен как подтверждённый провайдером")

	res = f.consents(t, pending,
		`{"consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":false}}`)
	assert.Equal(t, http.StatusBadRequest, res.StatusCode)
	assert.Zero(t, f.users(t, email))

	res = f.consents(t, pending, allConsents)

	require.Equal(t, http.StatusOK, res.StatusCode)
	var userID int64
	var verified bool
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT id, email_verified FROM users WHERE email = $1`, email).Scan(&userID, &verified))
	assert.False(t, verified, "введённый вручную адрес никто не подтверждал")
	assert.Equal(t, mandatory, f.grantedConsents(t, userID))
	assert.NotNil(t, liveCookie(res, "refresh_token"))
	assert.NotNil(t, liveCookie(res, "session_present"))
	assert.True(t, expiredCookie(res, "oauth_pending"))

	var assigned int64
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT curator_id FROM curator_client_relationships WHERE client_id = $1 AND status = 'active'`,
		userID).Scan(&assigned))
	assert.Equal(t, curatorID, assigned)

	var linked int
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM external_identities WHERE user_id = $1 AND provider = 'vk'`, userID).Scan(&linked))
	assert.Equal(t, 1, linked)
}

// Адрес от провайдера попадает в попытку с отметкой «подтверждён»; без неё
// аккаунт, созданный на экране согласий, начинался бы неподтверждённым.
func TestProviderEmail_IsMarkedAsFromProvider(t *testing.T) {
	f := newConsentsFlow(t, "oauth_consents_from_provider", oauth.Profile{
		ProviderUserID: "ya-5005", Email: "from-provider@example.test",
	})

	f.callback(t)

	var fromProvider bool
	require.NoError(t, f.db.QueryRowContext(context.Background(),
		`SELECT email_from_provider FROM oauth_pending_links`).Scan(&fromProvider))
	assert.True(t, fromProvider)
}

// Регрессия: подтверждение привязки паролем выдаёт сессию так же, как вход
// по паролю, — refresh-токен в HttpOnly-cookie и отметку session_present.
// Раньше шаг отдавал только access-токен, и браузер выходил при перезагрузке.
func TestConfirmLink_SetsSessionCookies(t *testing.T) {
	ctx := context.Background()
	const email = "has-password@example.test"
	f := newConsentsFlow(t, "oauth_link_cookies", oauth.Profile{
		ProviderUserID: "ya-6006", Email: email,
	})
	hash, err := bcrypt.GenerateFromPassword([]byte("correct horse battery"), bcrypt.MinCost)
	require.NoError(t, err)
	_, err = f.db.ExecContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified)
		VALUES ($1, $2, 'С паролем', 'client', true)`, email, string(hash))
	require.NoError(t, err)

	res := f.callback(t)
	location, err := url.Parse(res.Header.Get("Location"))
	require.NoError(t, err)
	require.Equal(t, "/auth/link", location.Path)
	pending := liveCookie(res, "oauth_pending")
	require.NotNil(t, pending)

	res = f.post(t, "/api/v1/auth/oauth/link", pending, `{"password":"correct horse battery"}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	refresh := liveCookie(res, "refresh_token")
	require.NotNil(t, refresh, "сессия без refresh-cookie кончается при перезагрузке")
	assert.True(t, refresh.HttpOnly)
	assert.Equal(t, "/api/v1/auth", refresh.Path)
	marker := liveCookie(res, "session_present")
	require.NotNil(t, marker, "без отметки граница сайта не знает о сессии")
	assert.Equal(t, "/", marker.Path)
	assert.True(t, expiredCookie(res, "oauth_pending"))
}

// Ввод адреса сессии не выдаёт ни для нового адреса, ни для занятого: для
// занятого сессию выдаёт подтверждение паролем (выше), для нового — экран
// согласий (TestProviderWithoutEmail_TypedAddressWaitsForConsents).
func TestCompleteEmail_ExistingAddressAsksForThePassword(t *testing.T) {
	ctx := context.Background()
	const email = "taken@example.test"
	f := newProviderFlow(t, "oauth_email_taken", "vk", oauth.Profile{ProviderUserID: "vk-7007"})
	_, err := f.db.ExecContext(ctx, `
		INSERT INTO users (email, password, name, role) VALUES ($1, 'x', 'Хозяин', 'client')`, email)
	require.NoError(t, err)

	pending := liveCookie(f.callback(t), "oauth_pending")
	require.NotNil(t, pending)

	res := f.post(t, "/api/v1/auth/oauth/email", pending, `{"email":"`+email+`"}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.Equal(t, map[string]any{"result": "needs_link_confirmation", "email": email}, decode(t, res)["data"])
	assert.Nil(t, liveCookie(res, "refresh_token"))
	assert.False(t, expiredCookie(res, "oauth_pending"))
}

// appCallback — тот же возврат от провайдера, но вход начат из приложения.
func (f consentsFlow) appCallback(t *testing.T) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/"+f.provider+"/callback?code=c&state=s", nil)
	req.AddCookie(&http.Cookie{Name: "oauth_state", Value: "s"})
	req.AddCookie(&http.Cookie{Name: "oauth_verifier", Value: "v"})
	req.AddCookie(&http.Cookie{Name: "oauth_provider", Value: f.provider})
	req.AddCookie(&http.Cookie{Name: "oauth_app", Value: challengeFor("секрет-приложения-достаточно-длинный-0123456789")})
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusFound, w.Code)
	return w.Result()
}

// Вход из приложения, который создал бы аккаунт, без согласий его не создаёт:
// приложение получает error=consents_required. Нативный экран согласий —
// POST /auth/native/consents (ios-native-session).
func TestAppSignIn_NoAccountWithoutConsents(t *testing.T) {
	const email = "app-new@example.test"
	f := newConsentsFlow(t, "oauth_app_no_consents", oauth.Profile{
		ProviderUserID: "ya-3004", Email: email, Name: "Новый",
	})

	location, err := url.Parse(f.appCallback(t).Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, auth.AppCallbackPath, location.Path)
	assert.Equal(t, "consents_required", location.Query().Get("error"))
	assert.Equal(t, 0, f.users(t, email), "аккаунт создан без согласий")
}
