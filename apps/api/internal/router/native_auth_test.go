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
