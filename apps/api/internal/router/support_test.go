package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/support"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// supportWidgetEngine builds the real engine with the support routes wired
// exactly as production does — including the per-IP rate limiter attached in
// registerSupportRoutes. The service is nil (capability disabled), which is
// enough here: these tests are about whether a request reaches the limiter at
// all, not about what the handler answers once it does.
func supportWidgetEngine(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	return New(Deps{
		Cfg:             &config.Config{Env: "test", JWTSecret: "test-secret"},
		Log:             logger.New(),
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
		Support:         support.NewHandler(&config.Config{}, logger.New(), nil),
	})
}

func postJSON(engine *gin.Engine, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	return w
}

// Прогон через настоящий собранный движок, а не изолированную копию
// лимитера: ловит и незарегистрированный лимит в auth_rate_limiter.go, и
// забытый вызов d.AuthRateLimiter.Limit(...) в registerSupportRoutes — оба
// выглядели бы одинаково снаружи: маршрут отвечает, лимит никогда не
// срабатывает, и без этого теста ни один прогон не заметил бы разницы.
func TestPublicSupportWebRoutesAreRateLimited(t *testing.T) {
	cases := []struct {
		name string
		path string
		body string
	}{
		{"start", "/api/v1/public/support/web", `{}`},
		{"message", "/api/v1/public/support/web/message", `{"token":"t","text":"вопрос"}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			engine := supportWidgetEngine(t)

			var last *httptest.ResponseRecorder
			for i := 0; i < 40; i++ {
				last = postJSON(engine, tc.path, tc.body)
			}

			assert.Equal(t, http.StatusTooManyRequests, last.Code,
				"%s must be rate-limited by IP — it costs a model call and needs no session", tc.path)
		})
	}
}

// GET .../messages — cheap, but still not free: a widget polling for replies
// left open indefinitely must eventually be told to slow down too.
func TestPublicSupportWebReadIsRateLimited(t *testing.T) {
	engine := supportWidgetEngine(t)

	var last *httptest.ResponseRecorder
	for i := 0; i < 80; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/public/support/web/messages?token=t", nil)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		last = w
	}

	assert.Equal(t, http.StatusTooManyRequests, last.Code)
}
