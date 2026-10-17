package auth

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// Сценарии native-client-session на уровне обработчиков: что уходит в базу и
// что видит приложение. Поведение против настоящей схемы — в
// native_session_integration_test.go.

type nativeResponse struct {
	Status string `json:"status"`
	Code   string `json:"code"`
	Data   struct {
		AccessToken      string           `json:"access_token"`
		RefreshToken     string           `json:"refresh_token"`
		ExpiresIn        int              `json:"expires_in"`
		RefreshExpiresIn int              `json:"refresh_expires_in"`
		User             *User            `json:"user"`
		PendingDeletion  *PendingDeletion `json:"pending_deletion"`
		Created          *bool            `json:"created"`
	} `json:"data"`
}

func nativeEngine(h *Handler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/native/login", h.NativeLogin)
	r.POST("/native/register", h.NativeRegister)
	r.POST("/native/refresh", h.NativeRefresh)
	r.POST("/native/logout", h.NativeLogout)
	r.POST("/native/magic-link/consume", h.NativeConsumeMagicLink)
	r.POST("/native/change-password", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		h.NativeChangePassword(c)
	})
	return r
}

// webCookie — действующая веб-сессия в браузере; нативные пути обязаны её не
// замечать.
var webCookie = &http.Cookie{Name: refreshCookieName, Value: "web-session-from-the-browser"}

func postNative(t *testing.T, r *gin.Engine, path, body string, cookies ...*http.Cookie) (*httptest.ResponseRecorder, nativeResponse) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var parsed nativeResponse
	if w.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &parsed), w.Body.String())
	}
	return w, parsed
}

// ttlFrom matches an expires_at that lies ttl after base, within a few seconds.
type ttlFrom struct {
	base func() time.Time
	ttl  time.Duration
}

func (m ttlFrom) Match(v driver.Value) bool {
	at, ok := v.(time.Time)
	if !ok {
		return false
	}
	expected := m.base().Add(m.ttl)
	return at.After(expected.Add(-5*time.Second)) && at.Before(expected.Add(5*time.Second))
}

func realNow() time.Time { return time.Now() }

func userRow(id int64, email string) *sqlmock.Rows {
	return sqlmock.NewRows([]string{"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version"}).
		AddRow(id, email, "Кто-то", "client", true, true, time.Now(), 0)
}

func refreshRow(id, userID int64, expiresAt time.Time, revokedAt, replacedBy any, kind string, device any) *sqlmock.Rows {
	return sqlmock.NewRows([]string{"id", "user_id", "expires_at", "revoked_at", "replaced_by_hash", "remember_me", "client_kind", "device_name"}).
		AddRow(id, userID, expiresAt, revokedAt, replacedBy, false, kind, device)
}

func expectLoginLookup(t *testing.T, mock sqlmock.Sqlmock, email, password string, deletionRequestedAt any) {
	t.Helper()
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	require.NoError(t, err)
	mock.ExpectQuery("SELECT id, email").
		WithArgs(email).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "password", "role", "email_verified",
			"onboarding_completed", "created_at", "deletion_requested_at", "token_version",
		}).AddRow(1, email, "Кто-то", string(hashed), "client", true, true, time.Now(), deletionRequestedAt, 0))
}

func assertNoCookies(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	assert.Empty(t, w.Header().Values("Set-Cookie"), "нативный путь не ставит cookie")
}

// SessionSpec: срок нативной сессии — 90 дней и не зависит от remember_me.
func TestSessionSpecLifetimes(t *testing.T) {
	assert.Equal(t, 24*time.Hour, WebSession(false).TTL())
	assert.Equal(t, 30*24*time.Hour, WebSession(true).TTL())
	assert.Equal(t, 90*24*time.Hour, NativeSession("").TTL())
	native := NativeSession("iPhone 15")
	native.RememberMe = true
	assert.Equal(t, 90*24*time.Hour, native.TTL(), "remember_me не меняет срок нативной сессии")
	assert.Equal(t, ClientWeb, SessionSpec{}.kind(), "пустой вид — веб, как до миграции 100")
	assert.Len(t, []rune(NativeSession(strings.Repeat("я", 200)).DeviceName), maxDeviceNameRunes)
}

// createRefreshToken: вид клиента и срок уходят в базу.
func TestCreateRefreshTokenStoresKindAndLifetime(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	mock.ExpectExec("INSERT INTO refresh_tokens").
		WithArgs(int64(7), sqlmock.AnyArg(), ttlFrom{realNow, 90 * 24 * time.Hour}, "ip", "ua", false, "ios", "iPhone 15").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO refresh_tokens").
		WithArgs(int64(7), sqlmock.AnyArg(), ttlFrom{realNow, 24 * time.Hour}, "ip", "ua", false, "web", nil).
		WillReturnResult(sqlmock.NewResult(2, 1))

	token, expiresAt, err := service.createRefreshToken(context.Background(), 7, "ip", "ua", NativeSession("iPhone 15"))
	require.NoError(t, err)
	assert.NotEmpty(t, token)
	assert.WithinDuration(t, time.Now().Add(90*24*time.Hour), expiresAt, 5*time.Second)

	_, _, err = service.createRefreshToken(context.Background(), 7, "ip", "ua", WebSession(false))
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// «Вход по паролю из приложения»: 200, пара токенов, нет Set-Cookie.
func TestNativeLoginReturnsPairInBodyWithoutCookies(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	expectLoginLookup(t, mock, "app@example.com", "Password123!", nil)
	mock.ExpectExec("INSERT INTO refresh_tokens").
		WithArgs(int64(1), sqlmock.AnyArg(), ttlFrom{realNow, RefreshTokenTTLNative}, sqlmock.AnyArg(), sqlmock.AnyArg(), false, "ios", "iPhone 15").
		WillReturnResult(sqlmock.NewResult(1, 1))

	w, body := postNative(t, nativeEngine(h), "/native/login",
		`{"email":"app@example.com","password":"Password123!","device_name":"iPhone 15"}`, webCookie)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NotEmpty(t, body.Data.AccessToken)
	assert.NotEmpty(t, body.Data.RefreshToken)
	assert.Equal(t, int(AccessTokenTTL.Seconds()), body.Data.ExpiresIn)
	assert.InDelta(t, RefreshTokenTTLNative.Seconds(), float64(body.Data.RefreshExpiresIn), 5)
	require.NotNil(t, body.Data.User)
	assert.Equal(t, "app@example.com", body.Data.User.Email)
	assert.Nil(t, body.Data.PendingDeletion)
	assertNoCookies(t, w)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestNativeLoginWrongPassword(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	expectLoginLookup(t, mock, "app@example.com", "Password123!", nil)

	w, body := postNative(t, nativeEngine(h), "/native/login", `{"email":"app@example.com","password":"nope"}`)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, apperrors.CodeInvalidCredentials, body.Code)
	assertNoCookies(t, w)
}

func TestNativeLoginWithoutBodyIsValidation(t *testing.T) {
	h, _, cleanup := setupTestHandler(t)
	defer cleanup()

	w, body := postNative(t, nativeEngine(h), "/native/login", ``, webCookie)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, apperrors.CodeValidation, body.Code)
}

// «Аккаунт ожидает удаления»: пара токенов и pending_deletion.
func TestNativeLoginReportsPendingDeletion(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	requestedAt := time.Now().Add(-3 * 24 * time.Hour).UTC().Truncate(time.Second)
	expectLoginLookup(t, mock, "leaving@example.com", "Password123!", requestedAt)
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

	w, body := postNative(t, nativeEngine(h), "/native/login",
		`{"email":"leaving@example.com","password":"Password123!"}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NotEmpty(t, body.Data.AccessToken)
	assert.NotEmpty(t, body.Data.RefreshToken)
	require.NotNil(t, body.Data.PendingDeletion)
	assert.True(t, requestedAt.Equal(body.Data.PendingDeletion.RequestedAt))
	assert.True(t, requestedAt.Add(accountCancellationWindow).Equal(body.Data.PendingDeletion.ScheduledFor))
	assertNoCookies(t, w)
}

// Регистрация из приложения: 201, нативная пара на 90 дней, нет cookie.
// Прежде регистрация всегда выпускала 24-часовую веб-сессию.
func TestNativeRegisterIssuesNativeSession(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	mock.ExpectQuery("INSERT INTO users").
		WithArgs("new@example.com", sqlmock.AnyArg(), "Новый").
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at"}).
			AddRow(5, "new@example.com", "Новый", "client", false, false, time.Now()))
	mock.ExpectExec("INSERT INTO user_settings").WithArgs(int64(5)).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO refresh_tokens").
		WithArgs(int64(5), sqlmock.AnyArg(), ttlFrom{realNow, RefreshTokenTTLNative}, sqlmock.AnyArg(), sqlmock.AnyArg(), false, "ios", nil).
		WillReturnResult(sqlmock.NewResult(1, 1))

	w, body := postNative(t, nativeEngine(h), "/native/register",
		`{"email":"new@example.com","password":"Password1!","name":"Новый"}`, webCookie)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.NotEmpty(t, body.Data.AccessToken)
	assert.NotEmpty(t, body.Data.RefreshToken)
	assert.InDelta(t, RefreshTokenTTLNative.Seconds(), float64(body.Data.RefreshExpiresIn), 5)
	assertNoCookies(t, w)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// «Запрос с cookie браузера без токена в теле»: 400 validation, ни одного
// обращения к базе — значит, ничего не выпущено и cookie не ротирована.
func TestNativeRefreshIgnoresTheBrowserCookie(t *testing.T) {
	for _, body := range []string{``, `{}`, `{"refresh_token":""}`, `not json`} {
		t.Run(body, func(t *testing.T) {
			h, mock, cleanup := setupTestHandler(t)
			defer cleanup()

			w, parsed := postNative(t, nativeEngine(h), "/native/refresh", body, webCookie)

			assert.Equal(t, http.StatusBadRequest, w.Code)
			assert.Equal(t, apperrors.CodeValidation, parsed.Code)
			assertNoCookies(t, w)
			assert.NoError(t, mock.ExpectationsWereMet(), "токен из cookie не должен дойти до базы")
		})
	}
}

// «Обновление нативной сессии»: новая пара; предъявленный токен помечен
// заменённым; новый — тоже нативный, с тем же устройством и новыми 90 днями.
func TestNativeRefreshRotatesAndSlides(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	plain := "native-refresh-token"
	hash := h.service.tokens.HashToken(plain)
	mock.ExpectQuery("SELECT id, user_id, expires_at, revoked_at, replaced_by_hash, remember_me, client_kind, device_name").
		WithArgs(hash).
		WillReturnRows(refreshRow(3, 1, time.Now().Add(10*24*time.Hour), nil, nil, "ios", "iPhone 15"))
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at = NOW\\(\\), replaced_by_hash = \\$1 WHERE id = \\$2").
		WithArgs(sqlmock.AnyArg(), int64(3)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO refresh_tokens").
		WithArgs(int64(1), sqlmock.AnyArg(), ttlFrom{realNow, RefreshTokenTTLNative}, sqlmock.AnyArg(), sqlmock.AnyArg(), false, "ios", "iPhone 15").
		WillReturnResult(sqlmock.NewResult(4, 1))
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT id, email").WithArgs(int64(1)).WillReturnRows(userRow(1, "app@example.com"))

	w, body := postNative(t, nativeEngine(h), "/native/refresh", `{"refresh_token":"`+plain+`"}`, webCookie)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NotEmpty(t, body.Data.AccessToken)
	assert.NotEmpty(t, body.Data.RefreshToken)
	assert.NotEqual(t, plain, body.Data.RefreshToken)
	assert.InDelta(t, RefreshTokenTTLNative.Seconds(), float64(body.Data.RefreshExpiresIn), 5)
	assertNoCookies(t, w)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Веб-токен нативный путь не принимает и не трогает: иначе он стал бы
// способом вынуть веб-сессию в тело ответа.
func TestNativeRefreshRefusesAWebToken(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	plain := "web-token"
	mock.ExpectQuery("FROM refresh_tokens WHERE token_hash").
		WithArgs(h.service.tokens.HashToken(plain)).
		WillReturnRows(refreshRow(3, 1, time.Now().Add(time.Hour), nil, nil, "web", nil))

	w, body := postNative(t, nativeEngine(h), "/native/refresh", `{"refresh_token":"`+plain+`"}`)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, apperrors.CodeTokenInvalid, body.Code)
	assert.NoError(t, mock.ExpectationsWereMet(), "ни ротации, ни отзыва")
}

// И наоборот: веб-путь не принимает нативный токен.
func TestWebRefreshRefusesANativeToken(t *testing.T) {
	service, mock, cleanup := setupTestService(t)
	defer cleanup()

	plain := "native-token"
	mock.ExpectQuery("FROM refresh_tokens WHERE token_hash").
		WithArgs(service.tokens.HashToken(plain)).
		WillReturnRows(refreshRow(3, 1, time.Now().Add(time.Hour), nil, nil, "ios", nil))

	_, err := service.RefreshTokens(context.Background(), plain, "ip", "ua")

	assert.ErrorIs(t, err, apperrors.ErrTokenInvalid)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// «Украденный токен предъявлен после ротации»: через минуту после ротации —
// 401 session_ended и отзыв всех токенов пользователя.
func TestNativeRefreshReuseAfterRotationEndsEverySession(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	plain := "rotated-native-token"
	mock.ExpectQuery("FROM refresh_tokens WHERE token_hash").
		WithArgs(h.service.tokens.HashToken(plain)).
		WillReturnRows(refreshRow(3, 1, time.Now().Add(80*24*time.Hour), time.Now().Add(-time.Minute), "replacement-hash", "ios", nil))
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at = NOW\\(\\) WHERE user_id = \\$1 AND revoked_at IS NULL").
		WithArgs(int64(1)).
		WillReturnResult(sqlmock.NewResult(0, 3))

	w, body := postNative(t, nativeEngine(h), "/native/refresh", `{"refresh_token":"`+plain+`"}`)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, apperrors.CodeSessionEnded, body.Code)
	assertNoCookies(t, w)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// «Токен старше 90 дней»: выпущен 91 день назад, не обновлялся — 401
// token_expired.
func TestNativeRefreshAfterNinetyDaysIsExpired(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	issued := time.Date(2026, time.March, 1, 12, 0, 0, 0, time.UTC)
	h.service.now = func() time.Time { return issued.Add(91 * 24 * time.Hour) }

	plain := "old-native-token"
	mock.ExpectQuery("FROM refresh_tokens WHERE token_hash").
		WithArgs(h.service.tokens.HashToken(plain)).
		WillReturnRows(refreshRow(3, 1, issued.Add(RefreshTokenTTLNative), nil, nil, "ios", nil))

	w, body := postNative(t, nativeEngine(h), "/native/refresh", `{"refresh_token":"`+plain+`"}`)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, apperrors.CodeTokenExpired, body.Code)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// «Сборка после даты отключения тела у веба» (задача 2.3): часы сервиса стоят
// на 2026-12-01, после bodyRefreshSunset, — нативное обновление работает и
// выпускает токен на 90 дней от этой даты.
func TestNativeRefreshDoesNotDependOnBodyRefreshSunset(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	fakeNow := time.Date(2026, time.December, 1, 9, 0, 0, 0, time.UTC)
	require.True(t, fakeNow.After(bodyRefreshSunset), "проверка имеет смысл только после bodyRefreshSunset")
	h.service.now = func() time.Time { return fakeNow }

	plain := "native-token-in-december"
	mock.ExpectQuery("FROM refresh_tokens WHERE token_hash").
		WithArgs(h.service.tokens.HashToken(plain)).
		WillReturnRows(refreshRow(3, 1, fakeNow.Add(30*24*time.Hour), nil, nil, "ios", nil))
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO refresh_tokens").
		WithArgs(int64(1), sqlmock.AnyArg(), ttlFrom{func() time.Time { return fakeNow }, RefreshTokenTTLNative},
			sqlmock.AnyArg(), sqlmock.AnyArg(), false, "ios", nil).
		WillReturnResult(sqlmock.NewResult(4, 1))
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT id, email").WithArgs(int64(1)).WillReturnRows(userRow(1, "app@example.com"))

	w, body := postNative(t, nativeEngine(h), "/native/refresh", `{"refresh_token":"`+plain+`"}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NotEmpty(t, body.Data.RefreshToken)
	assert.NoError(t, mock.ExpectationsWereMet())
}

type recordedUnregister struct {
	calls []struct {
		userID int64
		token  string
	}
}

func (r *recordedUnregister) UnregisterDevice(_ context.Context, userID int64, token string) error {
	r.calls = append(r.calls, struct {
		userID int64
		token  string
	}{userID, token})
	return nil
}

// «Выход» и «Выход с отпиской устройства»: 204 без access-токена, токен
// отозван, устройство пользователя забыто.
func TestNativeLogoutRevokesAndForgetsTheDevice(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()
	devices := &recordedUnregister{}
	h.WithDevices(devices)

	plain := "native-token"
	hash := h.service.tokens.HashToken(plain)
	mock.ExpectQuery("SELECT user_id FROM refresh_tokens WHERE token_hash = \\$1 AND client_kind = \\$2").
		WithArgs(hash, "ios").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(int64(9)))
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at = NOW\\(\\) WHERE token_hash = \\$1 AND revoked_at IS NULL").
		WithArgs(hash).
		WillReturnResult(sqlmock.NewResult(0, 1))

	w, _ := postNative(t, nativeEngine(h), "/native/logout",
		`{"refresh_token":"`+plain+`","device_token":"abcdef0123"}`, webCookie)

	assert.Equal(t, http.StatusNoContent, w.Code)
	assertNoCookies(t, w)
	require.Len(t, devices.calls, 1)
	assert.Equal(t, int64(9), devices.calls[0].userID)
	assert.Equal(t, "abcdef0123", devices.calls[0].token)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Уже отозванный токен — тоже 204.
func TestNativeLogoutOfARevokedTokenIsStillNoContent(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	plain := "already-revoked"
	hash := h.service.tokens.HashToken(plain)
	mock.ExpectQuery("SELECT user_id FROM refresh_tokens").
		WithArgs(hash, "ios").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(int64(9)))
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at").
		WithArgs(hash).
		WillReturnResult(sqlmock.NewResult(0, 0))

	w, _ := postNative(t, nativeEngine(h), "/native/logout", `{"refresh_token":"`+plain+`"}`)

	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Неизвестный или веб-токен: 204, ничего не отзывается и устройство не
// трогается — чужой веб-токен не повод отписать телефон.
func TestNativeLogoutOfAnUnknownTokenTouchesNothing(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()
	devices := &recordedUnregister{}
	h.WithDevices(devices)

	mock.ExpectQuery("SELECT user_id FROM refresh_tokens").WillReturnError(sql.ErrNoRows)

	w, _ := postNative(t, nativeEngine(h), "/native/logout", `{"refresh_token":"unknown","device_token":"abc"}`)

	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Empty(t, devices.calls)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Выход по cookie без тела: cookie не читается.
func TestNativeLogoutIgnoresTheBrowserCookie(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	w, body := postNative(t, nativeEngine(h), "/native/logout", ``, webCookie)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, apperrors.CodeValidation, body.Code)
	assertNoCookies(t, w)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Ссылка из письма в приложении: нативная пара и признак created, без cookie.
func TestNativeConsumeMagicLinkIssuesNativeSession(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	userID := int64(4)
	mock.ExpectQuery("UPDATE magic_links").
		WithArgs(h.service.tokens.HashToken("link-token")).
		WillReturnRows(sqlmock.NewRows([]string{"email", "user_id", "consents"}).AddRow("link@example.com", &userID, nil))
	mock.ExpectQuery("SELECT id, email").WithArgs(userID).WillReturnRows(userRow(userID, "link@example.com"))
	mock.ExpectExec("INSERT INTO refresh_tokens").
		WithArgs(userID, sqlmock.AnyArg(), ttlFrom{realNow, RefreshTokenTTLNative}, sqlmock.AnyArg(), sqlmock.AnyArg(), false, "ios", nil).
		WillReturnResult(sqlmock.NewResult(1, 1))

	w, body := postNative(t, nativeEngine(h), "/native/magic-link/consume", `{"token":"link-token"}`, webCookie)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NotEmpty(t, body.Data.AccessToken)
	assert.NotEmpty(t, body.Data.RefreshToken)
	require.NotNil(t, body.Data.Created)
	assert.False(t, *body.Data.Created)
	assertNoCookies(t, w)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestNativeConsumeMagicLinkWithoutTokenIsTokenInvalid(t *testing.T) {
	h, _, cleanup := setupTestHandler(t)
	defer cleanup()

	w, body := postNative(t, nativeEngine(h), "/native/magic-link/consume", `{}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, apperrors.CodeTokenInvalid, body.Code)
}

// «Смена пароля»: все сессии отозваны, в ответе новая нативная пара.
func TestNativeChangePasswordReturnsANativePair(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	hashed, err := bcrypt.GenerateFromPassword([]byte("OldPassword1!"), bcrypt.MinCost)
	require.NoError(t, err)
	mock.ExpectQuery("SELECT password FROM users").WithArgs(int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"password"}).AddRow(string(hashed)))
	mock.ExpectExec("UPDATE users SET password").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE refresh_tokens SET revoked_at = NOW\\(\\) WHERE user_id = \\$1 AND revoked_at IS NULL").
		WithArgs(int64(1)).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec("UPDATE users SET token_version").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT id, email").WithArgs(int64(1)).WillReturnRows(userRow(1, "app@example.com"))
	mock.ExpectExec("INSERT INTO refresh_tokens").
		WithArgs(int64(1), sqlmock.AnyArg(), ttlFrom{realNow, RefreshTokenTTLNative}, "", "", false, "ios", "iPhone 15").
		WillReturnResult(sqlmock.NewResult(1, 1))

	w, body := postNative(t, nativeEngine(h), "/native/change-password",
		`{"current_password":"OldPassword1!","new_password":"N3wPassword!x","device_name":"iPhone 15"}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NotEmpty(t, body.Data.AccessToken)
	assert.NotEmpty(t, body.Data.RefreshToken)
	assertNoCookies(t, w)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestNativeChangePasswordWrongCurrent(t *testing.T) {
	h, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	hashed, err := bcrypt.GenerateFromPassword([]byte("OldPassword1!"), bcrypt.MinCost)
	require.NoError(t, err)
	mock.ExpectQuery("SELECT password FROM users").
		WillReturnRows(sqlmock.NewRows([]string{"password"}).AddRow(string(hashed)))

	w, body := postNative(t, nativeEngine(h), "/native/change-password",
		`{"current_password":"wrong-one","new_password":"N3wPassword!x"}`)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, apperrors.CodePasswordIncorrect, body.Code)
}
