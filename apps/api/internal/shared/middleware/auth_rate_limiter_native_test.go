package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Нативный вход собран так же, как в router/auth.go: потолок на IP, затем
// лимит на пару «адрес + IP». Обработчик проверяет, что тело до него дошло.
func nativeLoginRouter(t *testing.T) *gin.Engine {
	t.Helper()
	rl := NewAuthRateLimiter()
	r := gin.New()
	r.POST("/native/login", rl.Limit("native-login-ip"), rl.LimitBy("native-login", ByEmailAndIP),
		func(c *gin.Context) {
			var body struct {
				Email string `json:"email"`
			}
			require.NoError(t, c.ShouldBindJSON(&body), "лимитер обязан вернуть тело обработчику")
			require.NotEmpty(t, body.Email)
			c.Status(http.StatusUnauthorized) // неудачная попытка входа
		})
	r.POST("/native/refresh", rl.LimitBy("native-refresh", ByRefreshToken), func(c *gin.Context) {
		var body struct {
			RefreshToken string `json:"refresh_token"`
		}
		require.NoError(t, c.ShouldBindJSON(&body))
		c.Status(http.StatusOK)
	})
	return r
}

func postFrom(r *gin.Engine, path, ip, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = ip + ":1234"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func loginBody(email string) string { return `{"email":"` + email + `","password":"wrong"}` }

// «Два человека за одним NAT»: 10 неудачных попыток под адресом A не мешают
// войти под адресом B с того же IP.
func TestNativeLoginLimitDoesNotBlockAnotherAddressBehindTheSameIP(t *testing.T) {
	r := nativeLoginRouter(t)

	for i := range 10 {
		w := postFrom(r, "/native/login", "10.1.1.1", loginBody("a@example.com"))
		require.Equal(t, http.StatusUnauthorized, w.Code, "попытка %d под A", i+1)
	}

	w := postFrom(r, "/native/login", "10.1.1.1", loginBody("b@example.com"))
	assert.Equal(t, http.StatusUnauthorized, w.Code, "B проходит до проверки пароля, а не упирается в лимит A")
}

// «Превышение лимита»: 11-я попытка под одним адресом с одного IP — 429
// too_many_attempts и Retry-After.
func TestNativeLoginEleventhAttemptIsLimitedWithRetryAfter(t *testing.T) {
	r := nativeLoginRouter(t)

	for range 10 {
		postFrom(r, "/native/login", "10.1.1.2", loginBody("a@example.com"))
	}
	// Регистр и пробелы адреса — тот же адрес.
	w := postFrom(r, "/native/login", "10.1.1.2", loginBody(" A@Example.com "))

	require.Equal(t, http.StatusTooManyRequests, w.Code)
	var body struct {
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, apperrors.CodeTooManyAttempts, body.Code)

	retryAfter, err := strconv.Atoi(w.Header().Get("Retry-After"))
	require.NoError(t, err, "Retry-After — целое число секунд")
	assert.Greater(t, retryAfter, 0)
	assert.LessOrEqual(t, retryAfter, 15*60)
}

// Тот же адрес с другого IP считается отдельно: ключ — пара.
func TestNativeLoginLimitIsPerAddressAndIP(t *testing.T) {
	r := nativeLoginRouter(t)
	for range 10 {
		postFrom(r, "/native/login", "10.1.1.3", loginBody("a@example.com"))
	}
	assert.Equal(t, http.StatusUnauthorized, postFrom(r, "/native/login", "10.1.1.4", loginBody("a@example.com")).Code)
}

// Потолок на IP — 100 попыток за 15 минут, в десять раз выше веб-лимита:
// перебор адресов с одного IP он всё же останавливает.
func TestNativeLoginIPCeiling(t *testing.T) {
	r := nativeLoginRouter(t)
	for i := range 100 {
		w := postFrom(r, "/native/login", "10.1.1.5", loginBody("user"+strconv.Itoa(i)+"@example.com"))
		require.Equal(t, http.StatusUnauthorized, w.Code, "попытка %d", i+1)
	}
	w := postFrom(r, "/native/login", "10.1.1.5", loginBody("fresh@example.com"))
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.NotEmpty(t, w.Header().Get("Retry-After"))
}

// «Частое обновление»: 61-е предъявление одного refresh-токена за 15 минут —
// 429 too_many_attempts; другой токен с того же IP не задет.
func TestNativeRefreshLimitIsPerToken(t *testing.T) {
	r := nativeLoginRouter(t)
	for i := range 60 {
		w := postFrom(r, "/native/refresh", "10.1.1.6", `{"refresh_token":"one"}`)
		require.Equal(t, http.StatusOK, w.Code, "обновление %d", i+1)
	}

	w := postFrom(r, "/native/refresh", "10.1.1.6", `{"refresh_token":"one"}`)
	require.Equal(t, http.StatusTooManyRequests, w.Code)
	var body struct {
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, apperrors.CodeTooManyAttempts, body.Code)
	assert.NotEmpty(t, w.Header().Get("Retry-After"))

	assert.Equal(t, http.StatusOK, postFrom(r, "/native/refresh", "10.1.1.6", `{"refresh_token":"two"}`).Code)
}

// Ключ лимитера хранит хэш токена, а не сам токен.
func TestByRefreshTokenKeepsNoUsableToken(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"refresh_token":"the-token"}`))
	key := ByRefreshToken(c)
	assert.NotContains(t, key, "the-token")
	assert.True(t, strings.HasPrefix(key, "token:"))
}

// Веб-лимит по IP тоже говорит, когда повторять.
func TestWebLimitSetsRetryAfter(t *testing.T) {
	router := newTestRouter("login")
	for range 10 {
		fireRequest(router, "10.2.2.2")
	}
	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	req.RemoteAddr = "10.2.2.2:1234"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.NotEmpty(t, w.Header().Get("Retry-After"))
}
