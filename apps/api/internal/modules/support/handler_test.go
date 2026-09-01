package support

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func webhookRouter(secret string, service *Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewHandler(&config.Config{TelegramWebhookSecret: secret}, logger.New(), service)

	r := gin.New()
	r.POST("/webhook", h.Webhook)
	return r
}

const update = `{"update_id":1,"message":{"message_id":1,"chat":{"id":555},"text":"привет"}}`

// The webhook path is public by necessity, so this header is the only thing
// between a genuine update and anybody's POST.
func TestWebhook_RejectsUpdatesWithoutTheSecret(t *testing.T) {
	cases := []struct {
		name   string
		secret string
	}{
		{"no header at all", ""},
		{"a wrong secret", "not-the-secret"},
		{"a prefix of the secret", "expected-sec"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(update))
			req.Header.Set("Content-Type", "application/json")
			if tc.secret != "" {
				req.Header.Set(telegram.SecretHeader, tc.secret)
			}
			w := httptest.NewRecorder()

			// A nil service would panic if the request got past the check.
			webhookRouter("expected-secret", nil).ServeHTTP(w, req)

			assert.Equal(t, http.StatusUnauthorized, w.Code)
		})
	}
}

// A deployment that never configured a secret must not accept an empty header
// as a match for it.
func TestWebhook_RefusesEverythingWhenNoSecretIsConfigured(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(update))
	req.Header.Set(telegram.SecretHeader, "")
	w := httptest.NewRecorder()

	webhookRouter("", nil).ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// The bot is an optional capability: without credentials it says so, like
// every other disabled feature, rather than crashing the process at startup.
func TestWebhook_UnconfiguredBotAnswersUnavailable(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(update))
	req.Header.Set(telegram.SecretHeader, "expected-secret")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	webhookRouter("expected-secret", nil).ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}

func TestValidSecret(t *testing.T) {
	assert.True(t, telegram.ValidSecret("s3cret", "s3cret"))
	assert.False(t, telegram.ValidSecret("s3cret", "s3cre"))
	assert.False(t, telegram.ValidSecret("s3cret", ""))
	assert.False(t, telegram.ValidSecret("", ""), "an unset secret matches nothing")
}
