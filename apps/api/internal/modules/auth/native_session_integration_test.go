//go:build integration

package auth_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/router"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Нативная сессия против настоящей схемы и настоящего движка маршрутов: те
// же пути, лимитеры и проверка access-токена, что в проде.

type nativeStand struct {
	engine  *gin.Engine
	db      *sql.DB
	service *auth.Service
}

func newNativeStand(t *testing.T) nativeStand {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db := testsupport.SchemaWithMigrations(t, "native")
	cfg := &config.Config{Env: "test", JWTSecret: "integration-secret-that-is-long-enough-32"}
	log := logger.New()
	versions := middleware.NewTokenVersions(db.DB)
	service := auth.NewService(db.DB, cfg, log).WithSessionCache(versions)
	handler := auth.NewHandler(service, cfg, log, nil).WithDevices(notifications.NewService(db, log))

	engine := router.New(router.Deps{
		Cfg:             cfg,
		Log:             log,
		DB:              db,
		TokenVersions:   versions,
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
		Auth:            handler,
		Account:         account.NewHandler(account.NewService(db, log, nil), log),
	})
	return nativeStand{engine: engine, db: db.DB, service: service}
}

type nativeBody struct {
	Code string `json:"code"`
	Data struct {
		AccessToken     string `json:"access_token"`
		RefreshToken    string `json:"refresh_token"`
		PendingDeletion *struct {
			RequestedAt  string `json:"requested_at"`
			ScheduledFor string `json:"scheduled_for"`
		} `json:"pending_deletion"`
		User *struct {
			ID int64 `json:"id"`
		} `json:"user"`
	} `json:"data"`
}

func (s nativeStand) call(t *testing.T, method, path, body, accessToken string, cookies ...*http.Cookie) (*httptest.ResponseRecorder, nativeBody) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	s.engine.ServeHTTP(w, req)
	var parsed nativeBody
	if w.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &parsed), w.Body.String())
	}
	return w, parsed
}

func (s nativeStand) registerNative(t *testing.T, email string) nativeBody {
	t.Helper()
	w, body := s.call(t, http.MethodPost, "/api/v1/auth/native/register",
		`{"email":"`+email+`","password":"IntegrationPass1!","name":"Кто-то","device_name":"iPhone 15",
		  "consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Empty(t, w.Header().Values("Set-Cookie"))
	return body
}

func (s nativeStand) refresh(t *testing.T, token string) (*httptest.ResponseRecorder, nativeBody) {
	t.Helper()
	return s.call(t, http.MethodPost, "/api/v1/auth/native/refresh", `{"refresh_token":"`+token+`"}`, "")
}

// Регистрация из приложения пишет нативную строку на 90 дней с моделью
// телефона; обновление помечает предъявленный токен заменённым и выпускает
// новый нативный — снова на 90 дней.
func TestNativeSessionIsStoredAsNativeAndSlides(t *testing.T) {
	s := newNativeStand(t)
	ctx := context.Background()

	first := s.registerNative(t, "native-slides@example.test")

	var kind, device string
	var ninetyDays bool
	require.NoError(t, s.db.QueryRowContext(ctx, `
		SELECT client_kind, device_name,
		       expires_at BETWEEN NOW() + INTERVAL '89 days' AND NOW() + INTERVAL '91 days'
		FROM refresh_tokens WHERE user_id = $1`, first.Data.User.ID).Scan(&kind, &device, &ninetyDays))
	assert.Equal(t, "ios", kind)
	assert.Equal(t, "iPhone 15", device)
	assert.True(t, ninetyDays, "нативная сессия — 90 дней, а не 24 часа веб-регистрации")

	w, second := s.refresh(t, first.Data.RefreshToken)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Empty(t, w.Header().Values("Set-Cookie"))
	assert.NotEqual(t, first.Data.RefreshToken, second.Data.RefreshToken)

	var replaced int
	require.NoError(t, s.db.QueryRowContext(ctx, `
		SELECT count(*) FROM refresh_tokens
		WHERE user_id = $1 AND revoked_at IS NOT NULL AND replaced_by_hash IS NOT NULL`,
		first.Data.User.ID).Scan(&replaced))
	assert.Equal(t, 1, replaced, "предъявленный токен помечен заменённым")

	var live int
	require.NoError(t, s.db.QueryRowContext(ctx, `
		SELECT count(*) FROM refresh_tokens
		WHERE user_id = $1 AND revoked_at IS NULL AND client_kind = 'ios' AND device_name = 'iPhone 15'
		  AND expires_at > NOW() + INTERVAL '89 days'`, first.Data.User.ID).Scan(&live))
	assert.Equal(t, 1, live, "замена — нативная, с тем же устройством и новыми 90 днями")
}

// «Запрос с cookie браузера без токена в теле»: действующая веб-cookie не
// обновляется нативным путём и не ротируется.
func TestNativeRefreshDoesNotRotateTheWebCookie(t *testing.T) {
	s := newNativeStand(t)
	ctx := context.Background()

	web, err := s.service.Register(ctx, "native-cookie@example.test", "IntegrationPass1!", "Веб",
		"127.0.0.1", "browser", &auth.ConsentsInput{TermsOfService: true, PrivacyPolicy: true, DataProcessing: true})
	require.NoError(t, err)

	w, body := s.call(t, http.MethodPost, "/api/v1/auth/native/refresh", ``, "",
		&http.Cookie{Name: "refresh_token", Value: web.RefreshToken})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, apperrors.CodeValidation, body.Code)
	assert.Empty(t, w.Header().Values("Set-Cookie"))

	var revoked bool
	require.NoError(t, s.db.QueryRowContext(ctx,
		`SELECT revoked_at IS NOT NULL FROM refresh_tokens WHERE user_id = $1`, web.User.ID).Scan(&revoked))
	assert.False(t, revoked, "веб-сессия не тронута")

	// И веб-токен, переложенный в тело, нативный путь тоже не берёт.
	w, body = s.refresh(t, web.RefreshToken)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, apperrors.CodeTokenInvalid, body.Code)
}

// «Украденный токен предъявлен после ротации»: через минуту после ротации —
// 401 session_ended, и отозваны все refresh-токены пользователя, веб тоже.
func TestNativeReuseAfterRotationEndsEverySession(t *testing.T) {
	s := newNativeStand(t)
	ctx := context.Background()

	first := s.registerNative(t, "native-reuse@example.test")
	_, err := s.service.Login(ctx, "native-reuse@example.test", "IntegrationPass1!", "127.0.0.1", "browser", false)
	require.NoError(t, err)

	w, second := s.refresh(t, first.Data.RefreshToken)
	require.Equal(t, http.StatusOK, w.Code)

	_, err = s.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = revoked_at - INTERVAL '1 minute' WHERE revoked_at IS NOT NULL`)
	require.NoError(t, err)

	w, body := s.refresh(t, first.Data.RefreshToken)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, apperrors.CodeSessionEnded, body.Code)

	var live int
	require.NoError(t, s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, first.Data.User.ID).Scan(&live))
	assert.Zero(t, live, "все токены пользователя — нативные и веб — отозваны")

	w, _ = s.refresh(t, second.Data.RefreshToken)
	assert.Equal(t, http.StatusUnauthorized, w.Code, "замена из той же цепочки падает вместе с ней")
}

// Токен, отозванный выходом, при повторе — 401 session_ended без отзыва
// остальных сессий: отзыв всего — только для токена, заменённого ротацией.
func TestNativeSignedOutTokenPresentedAgainEndsNothingElse(t *testing.T) {
	s := newNativeStand(t)
	ctx := context.Background()

	first := s.registerNative(t, "native-signed-out@example.test")
	web, err := s.service.Login(ctx, "native-signed-out@example.test", "IntegrationPass1!", "127.0.0.1", "browser", false)
	require.NoError(t, err)

	w, _ := s.call(t, http.MethodPost, "/api/v1/auth/native/logout",
		`{"refresh_token":"`+first.Data.RefreshToken+`"}`, "")
	require.Equal(t, http.StatusNoContent, w.Code)

	w, body := s.refresh(t, first.Data.RefreshToken)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, apperrors.CodeSessionEnded, body.Code)

	_, err = s.service.RefreshTokens(ctx, web.RefreshToken, "127.0.0.1", "browser")
	assert.NoError(t, err, "веб-сессия того же человека жива")
}

// «Выход» и «Выход с отпиской устройства».
func TestNativeLogoutEndsTheSessionAndForgetsThePhone(t *testing.T) {
	s := newNativeStand(t)
	ctx := context.Background()

	session := s.registerNative(t, "native-logout@example.test")
	const deviceToken = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO push_devices (user_id, token, installation_id, environment)
		VALUES ($1, $2, 'install-1', 'production')`, session.Data.User.ID, deviceToken)
	require.NoError(t, err)

	// Без access-токена.
	w, _ := s.call(t, http.MethodPost, "/api/v1/auth/native/logout",
		`{"refresh_token":"`+session.Data.RefreshToken+`","device_token":"`+deviceToken+`"}`, "")
	require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())

	var devices int
	require.NoError(t, s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM push_devices WHERE user_id = $1`, session.Data.User.ID).Scan(&devices))
	assert.Zero(t, devices, "устройство удалено — пуши на него больше не уходят")

	w, _ = s.refresh(t, session.Data.RefreshToken)
	assert.Equal(t, http.StatusUnauthorized, w.Code)

	// Повторный выход с тем же, уже отозванным, токеном — тоже 204.
	w, _ = s.call(t, http.MethodPost, "/api/v1/auth/native/logout",
		`{"refresh_token":"`+session.Data.RefreshToken+`"}`, "")
	assert.Equal(t, http.StatusNoContent, w.Code)
}

// «Смена пароля»: новая пара; прежний нативный токен и веб-сессии отозваны.
func TestNativeChangePasswordRevokesEverythingElse(t *testing.T) {
	s := newNativeStand(t)
	ctx := context.Background()

	session := s.registerNative(t, "native-password@example.test")
	web, err := s.service.Login(ctx, "native-password@example.test", "IntegrationPass1!", "127.0.0.1", "browser", true)
	require.NoError(t, err)

	w, replacement := s.call(t, http.MethodPost, "/api/v1/auth/native/change-password",
		`{"current_password":"IntegrationPass1!","new_password":"AnotherPass2@x","device_name":"iPhone 15"}`,
		session.Data.AccessToken)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Empty(t, w.Header().Values("Set-Cookie"))
	require.NotEmpty(t, replacement.Data.RefreshToken)

	// Сначала новая пара: предъявление отозванного токена ниже по общему
	// правилу повторного использования отзывает все сессии пользователя,
	// включая только что выданную.
	w, _ = s.refresh(t, replacement.Data.RefreshToken)
	assert.Equal(t, http.StatusOK, w.Code, "новая пара работает")

	var live []string
	rows, err := s.db.QueryContext(ctx,
		`SELECT client_kind FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, session.Data.User.ID)
	require.NoError(t, err)
	for rows.Next() {
		var kind string
		require.NoError(t, rows.Scan(&kind))
		live = append(live, kind)
	}
	require.NoError(t, rows.Close())
	assert.Equal(t, []string{"ios"}, live, "живой осталась только ротированная новая нативная пара")

	w, body := s.refresh(t, session.Data.RefreshToken)
	assert.Equal(t, http.StatusUnauthorized, w.Code, "прежний нативный токен отозван")
	assert.Equal(t, apperrors.CodeSessionEnded, body.Code)
	_, err = s.service.RefreshTokens(ctx, web.RefreshToken, "127.0.0.1", "browser")
	assert.ErrorIs(t, err, apperrors.ErrSessionEnded, "веб-сессия отозвана")
}

// «Аккаунт ожидает удаления»: вход из приложения возвращает пару и
// pending_deletion, и с этой парой DELETE /users/me/deletion отменяет
// удаление.
func TestNativeLoginDuringDeletionWindowCanCancelIt(t *testing.T) {
	s := newNativeStand(t)
	ctx := context.Background()

	registered := s.registerNative(t, "native-leaving@example.test")
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET deletion_requested_at = NOW() - INTERVAL '3 days' WHERE id = $1`, registered.Data.User.ID)
	require.NoError(t, err)

	w, login := s.call(t, http.MethodPost, "/api/v1/auth/native/login",
		`{"email":"native-leaving@example.test","password":"IntegrationPass1!"}`, "")
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Empty(t, w.Header().Values("Set-Cookie"))
	require.NotEmpty(t, login.Data.RefreshToken)
	require.NotNil(t, login.Data.PendingDeletion)
	assert.NotEmpty(t, login.Data.PendingDeletion.RequestedAt)
	assert.NotEmpty(t, login.Data.PendingDeletion.ScheduledFor)

	w, _ = s.call(t, http.MethodDelete, "/api/v1/users/me/deletion", ``, login.Data.AccessToken)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var pending bool
	require.NoError(t, s.db.QueryRowContext(ctx,
		`SELECT deletion_requested_at IS NOT NULL FROM users WHERE id = $1`, registered.Data.User.ID).Scan(&pending))
	assert.False(t, pending, "удаление отменено")
}
