//go:build integration

package auth_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// Вход через провайдера из приложения (native-oauth-handoff), целиком через
// обработчики и на настоящей базе: старт, колбэк, обмен кода и продолжения.

const appVerifier = "секрет-приложения-достаточно-длинный-0123456789"

func challengeFor(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (f consentsFlow) get(t *testing.T, path string) *http.Response {
	t.Helper()
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w.Result()
}

// nativeCallback — возврат от провайдера в потоке, начатом из приложения.
// Возвращает ответ и код из адреса /auth/native-complete.
func (f consentsFlow) nativeCallback(t *testing.T) (*http.Response, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/"+f.provider+"/callback?code=c&state=s", nil)
	req.AddCookie(&http.Cookie{Name: "oauth_state", Value: "s"})
	req.AddCookie(&http.Cookie{Name: "oauth_verifier", Value: "v"})
	req.AddCookie(&http.Cookie{Name: "oauth_provider", Value: f.provider})
	req.AddCookie(&http.Cookie{Name: "oauth_native_challenge", Value: challengeFor(appVerifier)})
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusFound, w.Code)

	location, err := url.Parse(w.Header().Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "app.example.com", location.Host)
	assert.Equal(t, auth.NativeCompletePath, location.Path)
	return w.Result(), location.Query().Get("code")
}

func (f consentsFlow) exchange(t *testing.T, code, verifier string) (*http.Response, map[string]any) {
	t.Helper()
	res := f.post(t, "/api/v1/auth/native/oauth/exchange", nil,
		`{"code":"`+code+`","code_verifier":"`+verifier+`","device_name":"iPhone 15"}`)
	return res, decode(t, res)
}

func data(body map[string]any) map[string]any {
	d, _ := body["data"].(map[string]any)
	return d
}

func requireNoSessionCookie(t *testing.T, res *http.Response) {
	t.Helper()
	for _, c := range res.Cookies() {
		assert.NotEqual(t, "refresh_token", c.Name, "нативный путь поставил refresh-cookie")
		assert.NotEqual(t, "session_present", c.Name, "нативный путь поставил session_present")
	}
}

func clientKindOf(t *testing.T, f consentsFlow, userID int64) []string {
	t.Helper()
	rows, err := f.db.QueryContext(context.Background(),
		`SELECT client_kind FROM refresh_tokens WHERE user_id = $1 ORDER BY id`, userID)
	require.NoError(t, err)
	defer rows.Close()
	var kinds []string
	for rows.Next() {
		var k string
		require.NoError(t, rows.Scan(&k))
		kinds = append(kinds, k)
	}
	return kinds
}

// «Поток без app_challenge»: client=ios без вызова — 400 validation; без
// client — обычный вход сайта.
func TestNativeOAuthStartRequiresAChallenge(t *testing.T) {
	f := newConsentsFlow(t, "native_oauth_start", oauth.Profile{ProviderUserID: "ya-1"})

	for _, path := range []string{
		"/api/v1/auth/oauth/yandex?client=ios",
		"/api/v1/auth/oauth/yandex?client=ios&app_challenge=short",
		"/api/v1/auth/oauth/yandex?client=android&app_challenge=" + challengeFor(appVerifier),
	} {
		res := f.get(t, path)
		assert.Equal(t, http.StatusBadRequest, res.StatusCode, path)
		assert.Equal(t, apperrors.CodeValidation, decode(t, res)["code"], path)
		assert.Nil(t, liveCookie(res, "oauth_state"), "поток начат, хотя запрос отклонён: %s", path)
	}

	res := f.get(t, "/api/v1/auth/oauth/yandex?client=ios&app_challenge="+challengeFor(appVerifier))
	require.Equal(t, http.StatusFound, res.StatusCode)
	stored := liveCookie(res, "oauth_native_challenge")
	require.NotNil(t, stored)
	assert.Equal(t, challengeFor(appVerifier), stored.Value)

	web := f.get(t, "/api/v1/auth/oauth/yandex")
	require.Equal(t, http.StatusFound, web.StatusCode)
	assert.Nil(t, liveCookie(web, "oauth_native_challenge"))
}

// «Успешный вход через Яндекс из приложения», «Перехваченный код без
// verifier», «Просроченный код».
func TestNativeOAuthSignInHandsTheSessionOverByCode(t *testing.T) {
	ctx := context.Background()
	f := newConsentsFlow(t, "native_oauth_signin", oauth.Profile{ProviderUserID: "ya-77", Email: "linked@example.test"})

	var userID int64
	require.NoError(t, f.db.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified)
		VALUES ('linked@example.test', NULL, 'Связанный', 'client', true) RETURNING id`).Scan(&userID))
	_, err := f.db.ExecContext(ctx, `
		INSERT INTO external_identities (user_id, provider, provider_user_id) VALUES ($1, 'yandex', 'ya-77')`, userID)
	require.NoError(t, err)
	_, err = f.db.ExecContext(ctx, `
		INSERT INTO user_consents (user_id, consent_type, granted)
		SELECT $1, t, true FROM unnest(ARRAY['terms_of_service','privacy_policy','data_processing']) t`, userID)
	require.NoError(t, err)

	t.Run("колбэк уводит на код и не ставит cookie сессии", func(t *testing.T) {
		res, code := f.nativeCallback(t)
		assert.GreaterOrEqual(t, len(code), 43, "код короче 32 байт")
		requireNoSessionCookie(t, res)
		assert.Empty(t, clientKindOf(t, f, userID), "колбэк выпустил сессию до обмена")
	})

	t.Run("неверный verifier сжигает код", func(t *testing.T) {
		_, code := f.nativeCallback(t)
		res, body := f.exchange(t, code, "чужой-секрет-чужой-секрет-чужой-секрет-0000")
		assert.Equal(t, http.StatusUnauthorized, res.StatusCode)
		assert.Equal(t, apperrors.CodeTokenInvalid, body["code"])

		res, body = f.exchange(t, code, appVerifier)
		assert.Equal(t, http.StatusUnauthorized, res.StatusCode, "код пережил попытку с чужим verifier")
		assert.Equal(t, apperrors.CodeTokenInvalid, body["code"])
	})

	t.Run("просроченный код", func(t *testing.T) {
		_, code := f.nativeCallback(t)
		_, err := f.db.ExecContext(ctx,
			`UPDATE oauth_handoff_codes SET expires_at = NOW() - INTERVAL '1 second' WHERE used_at IS NULL`)
		require.NoError(t, err)
		res, body := f.exchange(t, code, appVerifier)
		assert.Equal(t, http.StatusUnauthorized, res.StatusCode)
		assert.Equal(t, apperrors.CodeTokenInvalid, body["code"])
	})

	t.Run("верный verifier — нативная пара, один раз", func(t *testing.T) {
		_, code := f.nativeCallback(t)
		res, body := f.exchange(t, code, appVerifier)
		require.Equal(t, http.StatusOK, res.StatusCode, body)
		requireNoSessionCookie(t, res)
		d := data(body)
		assert.Equal(t, "signed_in", d["status"])
		assert.NotEmpty(t, d["access_token"])
		assert.NotEmpty(t, d["refresh_token"])
		assert.Equal(t, []string{"ios"}, clientKindOf(t, f, userID))

		res, _ = f.exchange(t, code, appVerifier)
		assert.Equal(t, http.StatusUnauthorized, res.StatusCode, "код сработал дважды")
	})
}

// «Отказ у провайдера»: приложение узнаёт причину на том же адресе.
func TestNativeOAuthDeclineReturnsToTheApp(t *testing.T) {
	f := newConsentsFlow(t, "native_oauth_decline", oauth.Profile{ProviderUserID: "ya-2"})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/yandex/callback?error=access_denied", nil)
	req.AddCookie(&http.Cookie{Name: "oauth_native_challenge", Value: challengeFor(appVerifier)})
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, req)
	require.Equal(t, http.StatusFound, w.Code)
	assert.Equal(t, "https://app.example.com/auth/native-complete?error=cancelled", w.Header().Get("Location"))
}

// «Новый пользователь VK»: обмен — needs_consents с pending_token; без
// согласий native/consents отвечает consents_required и аккаунта нет; с
// согласиями аккаунт создан, согласия сохранены, пара нативная.
func TestNativeOAuthNewUserWaitsForConsents(t *testing.T) {
	const email = "vk-new@example.test"
	f := newProviderFlow(t, "native_oauth_new", "vk", oauth.Profile{ProviderUserID: "vk-1", Email: email, Name: "Новый"})

	_, code := f.nativeCallback(t)
	res, body := f.exchange(t, code, appVerifier)
	require.Equal(t, http.StatusOK, res.StatusCode)
	d := data(body)
	assert.Equal(t, "needs_consents", d["status"])
	pending, _ := d["pending_token"].(string)
	require.NotEmpty(t, pending)
	assert.Equal(t, 0, f.users(t, email), "аккаунт создан до согласий")

	res = f.post(t, "/api/v1/auth/native/consents", nil,
		`{"pending_token":"`+pending+`","consents":{"terms_of_service":true,"privacy_policy":true}}`)
	assert.Equal(t, http.StatusBadRequest, res.StatusCode)
	assert.Equal(t, apperrors.CodeConsentsRequired, decode(t, res)["code"])
	assert.Equal(t, 0, f.users(t, email))

	res = f.post(t, "/api/v1/auth/native/consents", nil,
		`{"pending_token":"`+pending+`","device_name":"iPhone 15",
		  "consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)
	require.Equal(t, http.StatusOK, res.StatusCode)
	requireNoSessionCookie(t, res)
	d = data(decode(t, res))
	assert.Equal(t, true, d["created"])
	assert.Equal(t, "registered", d["status"])
	assert.NotEmpty(t, d["refresh_token"])
	user, _ := d["user"].(map[string]any)
	userID := int64(user["id"].(float64))
	assert.ElementsMatch(t, []string{"terms_of_service", "privacy_policy", "data_processing"}, f.grantedConsents(t, userID))
	assert.Equal(t, []string{"ios"}, clientKindOf(t, f, userID))
}

// «Аккаунт уже существует»: needs_link_confirmation, затем native/oauth/link
// с паролем — пара токенов и привязка VK.
func TestNativeOAuthExistingAccountIsClaimedWithThePassword(t *testing.T) {
	ctx := context.Background()
	const email = "owner@example.test"
	f := newProviderFlow(t, "native_oauth_link", "vk", oauth.Profile{ProviderUserID: "vk-9", Email: email})
	hash, err := bcrypt.GenerateFromPassword([]byte("OwnerPass1!"), bcrypt.MinCost)
	require.NoError(t, err)
	var userID int64
	require.NoError(t, f.db.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role) VALUES ($1, $2, 'Хозяин', 'client') RETURNING id`,
		email, string(hash)).Scan(&userID))

	_, code := f.nativeCallback(t)
	res, body := f.exchange(t, code, appVerifier)
	require.Equal(t, http.StatusOK, res.StatusCode)
	d := data(body)
	assert.Equal(t, "needs_link_confirmation", d["status"])
	assert.Equal(t, email, d["email"])
	pending := d["pending_token"].(string)

	res = f.post(t, "/api/v1/auth/native/oauth/link", nil, `{"pending_token":"`+pending+`","password":"wrong"}`)
	assert.Equal(t, http.StatusUnauthorized, res.StatusCode)
	assert.Equal(t, apperrors.CodePasswordIncorrect, decode(t, res)["code"])

	res = f.post(t, "/api/v1/auth/native/oauth/link", nil, `{"pending_token":"`+pending+`","password":"OwnerPass1!"}`)
	require.Equal(t, http.StatusOK, res.StatusCode)
	requireNoSessionCookie(t, res)
	assert.NotEmpty(t, data(decode(t, res))["refresh_token"])
	assert.Equal(t, []string{"ios"}, clientKindOf(t, f, userID))

	var linked int
	require.NoError(t, f.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM external_identities WHERE user_id = $1 AND provider = 'vk'`, userID).Scan(&linked))
	assert.Equal(t, 1, linked)
}

// Провайдер не отдал адрес: needs_email, затем native/oauth/email с новым
// адресом — needs_consents с тем же pending_token, сессии нет.
func TestNativeOAuthWithoutEmailAsksForOne(t *testing.T) {
	f := newProviderFlow(t, "native_oauth_email", "vk", oauth.Profile{ProviderUserID: "vk-3"})

	_, code := f.nativeCallback(t)
	_, body := f.exchange(t, code, appVerifier)
	d := data(body)
	require.Equal(t, "needs_email", d["status"])
	pending := d["pending_token"].(string)

	res := f.post(t, "/api/v1/auth/native/oauth/email", nil,
		`{"pending_token":"`+pending+`","email":"Typed@Example.test"}`)
	require.Equal(t, http.StatusOK, res.StatusCode)
	d = data(decode(t, res))
	assert.Equal(t, "needs_consents", d["status"])
	assert.Equal(t, pending, d["pending_token"])
	assert.Nil(t, d["refresh_token"])
	assert.Equal(t, 0, f.users(t, "typed@example.test"))

	res = f.post(t, "/api/v1/auth/native/oauth/email", nil, `{"pending_token":"00000000-0000-0000-0000-000000000000","email":"a@b.test"}`)
	assert.Equal(t, http.StatusBadRequest, res.StatusCode)
	assert.Equal(t, apperrors.CodeTokenInvalid, decode(t, res)["code"])
}

// «Вход через Яндекс в браузере»: поток без client по-прежнему ставит
// refresh-cookie и уводит на /auth/complete.
func TestWebOAuthStillEndsWithTheCookie(t *testing.T) {
	ctx := context.Background()
	f := newConsentsFlow(t, "native_oauth_web", oauth.Profile{ProviderUserID: "ya-5", Email: "web@example.test"})
	var userID int64
	require.NoError(t, f.db.QueryRowContext(ctx, `
		INSERT INTO users (email, password, name, role, email_verified)
		VALUES ('web@example.test', NULL, 'Веб', 'client', true) RETURNING id`).Scan(&userID))
	_, err := f.db.ExecContext(ctx, `
		INSERT INTO external_identities (user_id, provider, provider_user_id) VALUES ($1, 'yandex', 'ya-5');
		`, userID)
	require.NoError(t, err)
	_, err = f.db.ExecContext(ctx, `
		INSERT INTO user_consents (user_id, consent_type, granted)
		SELECT $1, t, true FROM unnest(ARRAY['terms_of_service','privacy_policy','data_processing']) t`, userID)
	require.NoError(t, err)

	res := f.callback(t)
	location, err := url.Parse(res.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "/auth/complete", location.Path)
	assert.NotNil(t, liveCookie(res, "refresh_token"))
	assert.Equal(t, []string{"web"}, clientKindOf(t, f, userID))
}
