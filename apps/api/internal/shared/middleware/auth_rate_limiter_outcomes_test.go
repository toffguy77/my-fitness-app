package middleware

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// accountLoginRouter — лимит на аккаунт, как в router/auth.go: считаются
// только неудачные попытки. Пароль "right" верен, остальное — нет.
func accountLoginRouter() *gin.Engine {
	rl := NewAuthRateLimiter()
	r := gin.New()
	handler := func(c *gin.Context) {
		var body struct {
			Password string `json:"password"`
		}
		_ = c.ShouldBindJSON(&body)
		if body.Password == "right" {
			c.Status(http.StatusOK)
			return
		}
		c.Status(http.StatusUnauthorized)
	}
	limit := rl.LimitOutcomesBy("login-account", ByEmail, FailedCredentials)
	r.POST("/login", limit, handler)
	r.POST("/native/login", limit, handler)
	return r
}

// Удачный вход счётчик аккаунта не тратит: счётчик, тратящийся на всё
// подряд, позволяет запереть владельца любому, кто знает адрес.
func TestLoginAccountLimitIgnoresSuccessfulSignIns(t *testing.T) {
	r := accountLoginRouter()
	for i := range 30 {
		w := postFrom(r, "/login", "10.0.0."+strconv.Itoa(i%5+1), `{"email":"owner@example.com","password":"right"}`)
		require.Equal(t, http.StatusOK, w.Code, "вход %d", i+1)
	}
	// И после 19 неудач верный пароль всё ещё проходит.
	for i := range 19 {
		w := postFrom(r, "/login", "10.0.1."+strconv.Itoa(i+1), `{"email":"owner@example.com","password":"x"}`)
		require.Equal(t, http.StatusUnauthorized, w.Code, "неудача %d", i+1)
	}
	assert.Equal(t, http.StatusOK,
		postFrom(r, "/login", "10.0.0.1", `{"email":"owner@example.com","password":"right"}`).Code)
}

// Неудачи с многих IP по-прежнему упираются в потолок аккаунта, и веб с
// приложением делят его.
func TestLoginAccountLimitCountsFailuresFromManyIPsAcrossWebAndNative(t *testing.T) {
	r := accountLoginRouter()
	for i := range 20 {
		path := "/login"
		if i%2 == 1 {
			path = "/native/login"
		}
		w := postFrom(r, path, "198.51.100."+strconv.Itoa(i+1), `{"email":"victim@example.com","password":"guess"}`)
		require.Equal(t, http.StatusUnauthorized, w.Code, "попытка %d", i+1)
	}
	for _, path := range []string{"/login", "/native/login"} {
		w := postFrom(r, path, "198.51.100.200", `{"email":"victim@example.com","password":"guess"}`)
		assert.Equal(t, http.StatusTooManyRequests, w.Code, path)
		assert.NotEmpty(t, w.Header().Get("Retry-After"))
	}
	// Полный счётчик отказывает и верному паролю: иначе 429 был бы подсказкой
	// «пароль неверен» для перебирающего.
	assert.Equal(t, http.StatusTooManyRequests,
		postFrom(r, "/login", "198.51.100.201", `{"email":"victim@example.com","password":"right"}`).Code)
}

// Письма адресату: считаются только отправленные (2xx).
func TestMagicLinkRecipientLimitCountsOnlySentLetters(t *testing.T) {
	rl := NewAuthRateLimiter()
	r := gin.New()
	r.POST("/magic-link/request", rl.LimitOutcomesBy("magic-link-recipient", ByEmail, LetterSent),
		func(c *gin.Context) {
			var body struct {
				Consents bool `json:"consents"`
			}
			_ = c.ShouldBindJSON(&body)
			if !body.Consents {
				c.Status(http.StatusBadRequest)
				return
			}
			c.Status(http.StatusOK)
		})

	for i := range 10 {
		w := postFrom(r, "/magic-link/request", "192.0.2.1", `{"email":"inbox@example.com"}`)
		require.Equal(t, http.StatusBadRequest, w.Code, "отклонённый запрос %d", i+1)
	}
	for i := range 5 {
		w := postFrom(r, "/magic-link/request", "192.0.2."+strconv.Itoa(i+2), `{"email":"inbox@example.com","consents":true}`)
		require.Equal(t, http.StatusOK, w.Code, "письмо %d", i+1)
	}
	w := postFrom(r, "/magic-link/request", "192.0.2.50", `{"email":"Inbox+again@example.com","consents":true}`)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}

func TestCanonicalMailbox(t *testing.T) {
	for in, want := range map[string]string{
		"victim@gmail.com":           "victim@gmail.com",
		"Victim+1@Gmail.com":         "victim@gmail.com",
		"v.i.c.t.i.m@googlemail.com": "victim@gmail.com",
		" V.ictim+x@GoogleMail.com ": "victim@gmail.com",
		"first.last+news@yandex.ru":  "first.last@yandex.ru",
		"first.last@yandex.ru":       "first.last@yandex.ru",
		"+only@example.com":          "+only@example.com",
		"no-at-sign":                 "no-at-sign",
		"":                           "",
	} {
		assert.Equal(t, want, CanonicalMailbox(in), in)
	}
}

// Три написания одного ящика Gmail — один счётчик.
func TestByEmailSharesOneBucketAcrossSpellingsOfAMailbox(t *testing.T) {
	r := accountLoginRouter()
	spellings := []string{"Victim+1@Gmail.com", "v.i.c.t.i.m@googlemail.com", "victim@gmail.com"}
	for i := range 20 {
		w := postFrom(r, "/login", "203.0.113."+strconv.Itoa(i+1),
			`{"email":"`+spellings[i%3]+`","password":"guess"}`)
		require.Equal(t, http.StatusUnauthorized, w.Code, "попытка %d", i+1)
	}
	for _, email := range spellings {
		w := postFrom(r, "/login", "203.0.113.99", `{"email":"`+email+`","password":"guess"}`)
		assert.Equal(t, http.StatusTooManyRequests, w.Code, email)
	}
}

// AUTH_RATE_LIMIT_SCALE (E2E ставит 100) растягивает каждый лимит, в том
// числе лимиты по аккаунту и адресату со счётом только по исходу: иначе
// прогон с одного IP упёрся бы в них, хотя остальные растянуты.
func TestAuthRateLimitScaleAppliesToEveryLimit(t *testing.T) {
	saved := authLimitScale
	authLimitScale = 3
	t.Cleanup(func() { authLimitScale = saved })

	for endpoint, cfg := range authLimitConfigs {
		rl := NewAuthRateLimiter()
		r := gin.New()
		status := http.StatusOK
		var limit gin.HandlerFunc
		switch endpoint {
		case "login-account":
			status = http.StatusUnauthorized
			limit = rl.LimitOutcomesBy(endpoint, ByEmail, FailedCredentials)
		case "magic-link-recipient":
			limit = rl.LimitOutcomesBy(endpoint, ByEmail, LetterSent)
		default:
			limit = rl.LimitBy(endpoint, ByEmail)
		}
		r.POST("/x", limit, func(c *gin.Context) { c.Status(status) })

		for i := range cfg.maxRequests * 3 {
			w := postFrom(r, "/x", "10.9.9.9", `{"email":"scale@example.com"}`)
			require.NotEqual(t, http.StatusTooManyRequests, w.Code, "%s: запрос %d из %d", endpoint, i+1, cfg.maxRequests*3)
		}
		assert.Equal(t, http.StatusTooManyRequests,
			postFrom(r, "/x", "10.9.9.9", `{"email":"scale@example.com"}`).Code, endpoint)
	}
}
