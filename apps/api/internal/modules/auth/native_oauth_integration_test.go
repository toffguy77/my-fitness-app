//go:build integration

package auth_test

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/router"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
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

// linkStand — настоящий движок маршрутов (лимитеры как в проде) с
// обработчиком внешнего входа, для проверок пароля в oauth/link.
type linkStand struct {
	engine *gin.Engine
	db     *sql.DB
}

func newLinkStand(t *testing.T, name string) linkStand {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := testsupport.SchemaWithMigrations(t, name)
	cfg := &config.Config{Env: "test", JWTSecret: "integration-secret-that-is-long-enough-32", AppDomain: "app.example.com"}
	log := logger.New()
	versions := middleware.NewTokenVersions(db.DB)
	service := auth.NewService(db.DB, cfg, log).WithSessionCache(versions)
	engine := router.New(router.Deps{
		Cfg:             cfg,
		Log:             log,
		DB:              db,
		TokenVersions:   versions,
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
		Auth:            auth.NewHandler(service, cfg, log, nil),
		OAuth:           auth.NewOAuthHandler(cfg, log, service, oauth.NewRegistry()),
	})
	return linkStand{engine: engine, db: db.DB}
}

func (s linkStand) owner(t *testing.T, email, password string) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	require.NoError(t, err)
	_, err = s.db.Exec(`INSERT INTO users (email, password, name, role) VALUES ($1, $2, 'Хозяин', 'client')`, email, string(hash))
	require.NoError(t, err)
}

func (s linkStand) pending(t *testing.T, email string) string {
	t.Helper()
	var id string
	require.NoError(t, s.db.QueryRow(`
		INSERT INTO oauth_pending_links (provider, provider_user_id, email, expires_at, email_from_provider)
		VALUES ('vk', gen_random_uuid()::text, $1, NOW() + INTERVAL '10 minutes', true) RETURNING id`, email).Scan(&id))
	return id
}

func (s linkStand) post(t *testing.T, path, ip, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = ip + ":4444"
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	s.engine.ServeHTTP(w, req)
	return w
}

func (s linkStand) nativeLink(t *testing.T, ip, pending, password string) *httptest.ResponseRecorder {
	return s.post(t, "/api/v1/auth/native/oauth/link", ip,
		`{"pending_token":"`+pending+`","password":"`+password+`"}`)
}

// Пятый неверный пароль сжигает попытку: верный после него не помогает.
func TestLinkPasswordBurnsTheAttemptAfterFiveFailures(t *testing.T) {
	s := newLinkStand(t, "link_burn")
	s.owner(t, "burn@example.test", "OwnerPass1!")
	pending := s.pending(t, "burn@example.test")

	for i := range auth.MaxLinkPasswordFailures {
		w := s.nativeLink(t, "203.0.113."+strconv.Itoa(i+1), pending, "wrong")
		require.Equal(t, http.StatusUnauthorized, w.Code, "попытка %d", i+1)
	}
	w := s.nativeLink(t, "203.0.113.50", pending, "OwnerPass1!")
	assert.Equal(t, http.StatusBadRequest, w.Code, "попытка пережила пять неверных паролей")
	assert.Contains(t, w.Body.String(), apperrors.CodeTokenInvalid)
}

// Неверные пароли подтверждения — и веб, и приложения — идут в общий
// login-account этого аккаунта: 20 неудач через oauth/link, и вход по паролю
// в этот аккаунт с нового IP получает 429, а другой аккаунт — нет.
func TestLinkPasswordFailuresCountAgainstTheAccount(t *testing.T) {
	s := newLinkStand(t, "link_account")
	s.owner(t, "target@example.test", "OwnerPass1!")
	s.owner(t, "other@example.test", "OtherPass1!")

	failures := 0
	for attempt := 0; failures < 20; attempt++ {
		pending := s.pending(t, "Target@Example.test")
		for range 4 { // меньше пяти — попытка не сгорает
			ip := "198.51.100." + strconv.Itoa(failures%9+1)
			var w *httptest.ResponseRecorder
			if failures%2 == 0 {
				w = s.nativeLink(t, ip, pending, "guess")
			} else {
				w = s.post(t, "/api/v1/auth/oauth/link", ip, `{"password":"guess"}`,
					&http.Cookie{Name: "oauth_pending", Value: pending})
			}
			require.Equal(t, http.StatusUnauthorized, w.Code, "неудача %d", failures+1)
			failures++
			if failures == 20 {
				break
			}
		}
	}

	w := s.post(t, "/api/v1/auth/native/login", "192.0.2.77", `{"email":"target@example.test","password":"OwnerPass1!"}`)
	assert.Equal(t, http.StatusTooManyRequests, w.Code, "перебор через oauth/link обошёл лимит аккаунта")
	w = s.post(t, "/api/v1/auth/login", "192.0.2.78", `{"email":"target@example.test","password":"OwnerPass1!"}`)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)

	w = s.post(t, "/api/v1/auth/native/login", "192.0.2.77", `{"email":"other@example.test","password":"OtherPass1!"}`)
	assert.Equal(t, http.StatusOK, w.Code, "другой аккаунт задет")
}

// Потолок на IP у native/oauth/link — как у веб-/auth/oauth/link: 10 за
// 15 минут, без NAT-поправки.
func TestNativeLinkIPLimitMatchesTheWebOne(t *testing.T) {
	s := newLinkStand(t, "link_ip")
	for i := range 10 {
		w := s.nativeLink(t, "192.0.2.9", "00000000-0000-0000-0000-00000000000"+strconv.Itoa(i), "x")
		require.NotEqual(t, http.StatusTooManyRequests, w.Code, "запрос %d", i+1)
	}
	assert.Equal(t, http.StatusTooManyRequests,
		s.nativeLink(t, "192.0.2.9", "00000000-0000-0000-0000-000000000099", "x").Code)
}

// Параллельные неверные пароли не проскакивают потолок: попытка списывается
// до сравнения одним UPDATE с условием, так что из 20 одновременных запросов
// до bcrypt доходят не больше пяти, а попытка сгорает.
func TestLinkPasswordCeilingHoldsUnderConcurrency(t *testing.T) {
	ctx := context.Background()
	s := newLinkStand(t, "link_concurrent")
	s.owner(t, "parallel@example.test", "OwnerPass1!")
	pending := s.pending(t, "parallel@example.test")

	service := auth.NewService(s.db, &config.Config{JWTSecret: "integration-secret-that-is-long-enough-32"}, logger.New())
	var wg sync.WaitGroup
	results := make(chan error, 20)
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := service.ConfirmLinkWithPasswordFor(ctx, auth.NativeSession(""), pending, "wrong", "ip", "ua")
			results <- err
		}()
	}
	wg.Wait()
	close(results)

	compared := 0
	for err := range results {
		require.Error(t, err)
		if errors.Is(err, apperrors.ErrInvalidCredentials) {
			compared++
		} else {
			require.ErrorIs(t, err, apperrors.ErrTokenInvalid)
		}
	}
	assert.LessOrEqual(t, compared, auth.MaxLinkPasswordFailures, "до bcrypt дошло больше догадок, чем положено")
	assert.Equal(t, auth.MaxLinkPasswordFailures, compared)

	var left int
	require.NoError(t, s.db.QueryRow(`SELECT COUNT(*) FROM oauth_pending_links WHERE id = $1`, pending).Scan(&left))
	assert.Zero(t, left, "попытка пережила потолок")
}

// Ключ лимита берётся оттуда же, откуда обработчик берёт попытку: веб —
// из cookie. Тело с pending_token чужого аккаунта счёт не переносит.
func TestWebLinkLimitIsKeyedByTheCookieItChecks(t *testing.T) {
	s := newLinkStand(t, "link_key_source")
	s.owner(t, "a@example.test", "PassA1!aaaa")
	s.owner(t, "b@example.test", "PassB1!bbbb")

	for i := range 20 {
		pendingA := s.pending(t, "a@example.test")
		pendingB := s.pending(t, "b@example.test")
		w := s.post(t, "/api/v1/auth/oauth/link", "198.51.100."+strconv.Itoa(i%9+1),
			`{"pending_token":"`+pendingA+`","password":"guess"}`,
			&http.Cookie{Name: "oauth_pending", Value: pendingB})
		require.Equal(t, http.StatusUnauthorized, w.Code, "неудача %d", i+1)
	}

	assert.Equal(t, http.StatusTooManyRequests,
		s.post(t, "/api/v1/auth/login", "192.0.2.1", `{"email":"b@example.test","password":"PassB1!bbbb"}`).Code,
		"неудачи по cookie B не засчитаны аккаунту B")
	assert.Equal(t, http.StatusOK,
		s.post(t, "/api/v1/auth/login", "192.0.2.2", `{"email":"a@example.test","password":"PassA1!aaaa"}`).Code,
		"неудачи засчитаны аккаунту A из тела, которое обработчик не читает")
}

// Pending-токен в неканоническом виде (заглавные буквы, фигурные скобки, без
// дефисов) Postgres принял бы за тот же uuid, а ключ лимита по нему не нашёл
// бы адреса — и догадка о пароле прошла бы мимо счётчика аккаунта. Такой
// токен отклоняется до проверки пароля, и попытка не тратится.
func TestNonCanonicalPendingTokenIsRefusedBeforeThePassword(t *testing.T) {
	ctx := context.Background()
	s := newLinkStand(t, "link_canonical")
	s.owner(t, "canon@example.test", "OwnerPass1!")
	pending := s.pending(t, "canon@example.test")

	for _, spelling := range []string{
		strings.ToUpper(pending),
		"{" + pending + "}",
		strings.ReplaceAll(pending, "-", ""),
	} {
		w := s.nativeLink(t, "203.0.113.70", spelling, "OwnerPass1!")
		assert.Equal(t, http.StatusBadRequest, w.Code, spelling)
		assert.Contains(t, w.Body.String(), apperrors.CodeValidation, spelling)

		w = s.post(t, "/api/v1/auth/oauth/link", "203.0.113.71", `{"password":"OwnerPass1!"}`,
			&http.Cookie{Name: "oauth_pending", Value: spelling})
		assert.Equal(t, http.StatusBadRequest, w.Code, spelling)

		for _, path := range []string{"/api/v1/auth/native/oauth/email", "/api/v1/auth/native/consents"} {
			w = s.post(t, path, "203.0.113.72", `{"pending_token":"`+spelling+`","email":"x@example.test",
				"consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)
			assert.Equal(t, http.StatusBadRequest, w.Code, path+" "+spelling)
		}
	}

	var failed int
	require.NoError(t, s.db.QueryRowContext(ctx,
		`SELECT failed_attempts FROM oauth_pending_links WHERE id = $1`, pending).Scan(&failed))
	assert.Zero(t, failed, "неканонический токен потратил попытку")

	w := s.nativeLink(t, "203.0.113.73", pending, "OwnerPass1!")
	assert.Equal(t, http.StatusOK, w.Code, "канонический токен после отказов работает")
}
