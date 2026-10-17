package router

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Лимиты нативного входа стоят именно на маршрутах /auth/native/*, а не только
// существуют в лимитере: собирается настоящий движок.
func nativeAuthEngine(t *testing.T) (*gin.Engine, sqlmock.Sqlmock) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	cfg := &config.Config{Env: "test", JWTSecret: "test-secret"}
	log := logger.New()
	return New(Deps{
		Cfg:             cfg,
		Log:             log,
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
		Auth:            auth.NewHandler(auth.NewService(db, cfg, log), cfg, log, nil),
	}), mock
}

func nativePost(engine *gin.Engine, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "100.64.0.1:5555" // мобильный NAT
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	return w
}

func TestNativeLoginRouteIsLimitedPerAddressAndIP(t *testing.T) {
	engine, mock := nativeAuthEngine(t)
	for range 11 {
		mock.ExpectQuery("SELECT id, email").WillReturnError(sql.ErrNoRows)
	}

	for i := range 10 {
		w := nativePost(engine, "/api/v1/auth/native/login", `{"email":"a@example.com","password":"x"}`)
		require.Equal(t, http.StatusUnauthorized, w.Code, "попытка %d", i+1)
	}
	limited := nativePost(engine, "/api/v1/auth/native/login", `{"email":"a@example.com","password":"x"}`)
	assert.Equal(t, http.StatusTooManyRequests, limited.Code)
	assert.NotEmpty(t, limited.Header().Get("Retry-After"))

	other := nativePost(engine, "/api/v1/auth/native/login", `{"email":"b@example.com","password":"x"}`)
	assert.Equal(t, http.StatusUnauthorized, other.Code, "второй адрес за тем же IP не заблокирован")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestNativeRefreshRouteIsLimitedPerToken(t *testing.T) {
	engine, mock := nativeAuthEngine(t)
	for range 60 {
		mock.ExpectQuery("FROM refresh_tokens").WillReturnError(sql.ErrNoRows)
	}

	for i := range 60 {
		w := nativePost(engine, "/api/v1/auth/native/refresh", `{"refresh_token":"same"}`)
		require.Equal(t, http.StatusUnauthorized, w.Code, "обновление %d", i+1)
	}
	limited := nativePost(engine, "/api/v1/auth/native/refresh", `{"refresh_token":"same"}`)
	assert.Equal(t, http.StatusTooManyRequests, limited.Code)
	assert.NotEmpty(t, limited.Header().Get("Retry-After"))
	assert.NoError(t, mock.ExpectationsWereMet())
}

// native/logout не требует access-токена, native/change-password требует.
func TestNativeLogoutNeedsNoAccessTokenButChangePasswordDoes(t *testing.T) {
	engine, mock := nativeAuthEngine(t)
	mock.ExpectQuery("SELECT user_id FROM refresh_tokens").WillReturnError(sql.ErrNoRows)

	assert.Equal(t, http.StatusNoContent,
		nativePost(engine, "/api/v1/auth/native/logout", `{"refresh_token":"x"}`).Code)
	assert.Equal(t, http.StatusUnauthorized,
		nativePost(engine, "/api/v1/auth/native/change-password", `{"current_password":"a","new_password":"bbbbbbbb"}`).Code)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func postFromIP(engine *gin.Engine, path, ip, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = ip + ":5555"
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	return w
}

// Ниже база не отвечает ни на что (у sqlmock нет ожиданий): вход отвечает
// 401, запрос ссылки — 500. Проверяется только одно — дошёл ли запрос до
// обработчика или остановлен лимитом (429).

// Пара «адрес + IP» не мешает перебирать пароль одного аккаунта с многих IP:
// это делает лимит на аккаунт — 20 попыток за 15 минут с любых адресов.
func TestLoginAccountCapStopsOneAddressFromManyIPs(t *testing.T) {
	engine, _ := nativeAuthEngine(t)
	body := `{"email":"victim@example.com","password":"guess"}`

	for i := range 20 {
		ip := "198.51.100." + string(rune('1'+i/10)) // по 10 попыток с двух IP
		w := postFromIP(engine, "/api/v1/auth/native/login", ip, body)
		require.NotEqual(t, http.StatusTooManyRequests, w.Code, "попытка %d", i+1)
	}

	w := postFromIP(engine, "/api/v1/auth/native/login", "198.51.100.9",
		`{"email":"Victim@Example.com ","password":"guess"}`)
	assert.Equal(t, http.StatusTooManyRequests, w.Code, "21-я попытка в аккаунт с нового IP")
	assert.NotEmpty(t, w.Header().Get("Retry-After"))

	other := postFromIP(engine, "/api/v1/auth/native/login", "198.51.100.9",
		`{"email":"someone-else@example.com","password":"x"}`)
	assert.NotEqual(t, http.StatusTooManyRequests, other.Code, "другой аккаунт с того же IP не задет")
}

// Веб и приложение считают попытки в один аккаунт одним счётчиком: иначе
// перебор просто делится на два пути.
func TestLoginAccountCapIsSharedByWebAndNative(t *testing.T) {
	engine, _ := nativeAuthEngine(t)
	body := `{"email":"shared@example.com","password":"guess"}`

	for i := range 10 {
		require.NotEqual(t, http.StatusTooManyRequests,
			postFromIP(engine, "/api/v1/auth/login", "203.0.113.1", body).Code, "веб %d", i+1)
	}
	for i := range 10 {
		require.NotEqual(t, http.StatusTooManyRequests,
			postFromIP(engine, "/api/v1/auth/native/login", "203.0.113.2", body).Code, "приложение %d", i+1)
	}

	native := postFromIP(engine, "/api/v1/auth/native/login", "203.0.113.3", body)
	assert.Equal(t, http.StatusTooManyRequests, native.Code)
	assert.NotEmpty(t, native.Header().Get("Retry-After"))
	web := postFromIP(engine, "/api/v1/auth/login", "203.0.113.4", body)
	assert.Equal(t, http.StatusTooManyRequests, web.Code)
	assert.NotEmpty(t, web.Header().Get("Retry-After"))
}

// Письма одному адресату — 5 за 15 минут с любых IP, общим счётчиком веба и
// приложения.
func TestMagicLinkRecipientCapIsSharedByWebAndNative(t *testing.T) {
	engine, _ := nativeAuthEngine(t)
	body := `{"email":"inbox@example.com"}`

	for i, path := range []string{
		"/api/v1/auth/magic-link/request", "/api/v1/auth/native/magic-link/request",
		"/api/v1/auth/magic-link/request", "/api/v1/auth/native/magic-link/request",
		"/api/v1/auth/native/magic-link/request",
	} {
		w := postFromIP(engine, path, "192.0.2."+string(rune('1'+i)), body)
		require.NotEqual(t, http.StatusTooManyRequests, w.Code, "письмо %d", i+1)
	}

	for _, path := range []string{"/api/v1/auth/native/magic-link/request", "/api/v1/auth/magic-link/request"} {
		w := postFromIP(engine, path, "192.0.2.9", body)
		assert.Equal(t, http.StatusTooManyRequests, w.Code, path)
		assert.NotEmpty(t, w.Header().Get("Retry-After"))
	}

	other := postFromIP(engine, "/api/v1/auth/native/magic-link/request", "192.0.2.9", `{"email":"another@example.com"}`)
	assert.NotEqual(t, http.StatusTooManyRequests, other.Code, "другой адресат не задет")
}

// Потолок на IP у нативного запроса ссылки — рядом с веб-лимитом, без
// NAT-поправки входа: 10 писем за 15 минут с одного IP разным адресатам.
func TestNativeMagicLinkIPCeilingIsNearTheWebOne(t *testing.T) {
	engine, _ := nativeAuthEngine(t)
	for i := range 10 {
		w := postFromIP(engine, "/api/v1/auth/native/magic-link/request", "192.0.2.50",
			`{"email":"r`+string(rune('a'+i))+`@example.com"}`)
		require.NotEqual(t, http.StatusTooManyRequests, w.Code, "письмо %d", i+1)
	}
	w := postFromIP(engine, "/api/v1/auth/native/magic-link/request", "192.0.2.50", `{"email":"rz@example.com"}`)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}
