package telegram

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func clientAnswering(t *testing.T, status int, body string) *Client {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)

	c := NewClient("токен")
	c.baseURL = server.URL
	return c
}

const ourURL = "https://burcev.team/api/v1/public/support/telegram"

// Самый молчаливый отказ этого бота: Telegram оставляет ошибку доставки себе.
// Если сертификат истёк, маршрут сменился или хост отказал — обновления просто
// перестают приходить. Здесь ничего не пишется в журнал, потому что сюда
// ничего не доходит: бот выглядит живым, а ответов никто не получает.
func TestWebhookDeliveryFailureIsReported(t *testing.T) {
	c := clientAnswering(t, http.StatusOK,
		`{"ok":true,"result":{"url":"`+ourURL+`","last_error_message":"SSL error {error:0A000086}"}}`)

	err := c.VerifyWebhook(context.Background(), ourURL)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "SSL error")
}

// Вебхук не задан — обновлений не будет вовсе, и это не менее тихо.
func TestMissingWebhookIsReported(t *testing.T) {
	c := clientAnswering(t, http.StatusOK, `{"ok":true,"result":{"url":""}}`)

	err := c.VerifyWebhook(context.Background(), ourURL)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "nothing reaches the bot")
}

// У бота в Telegram ровно один адрес вебхука. Если обе среды делят токен,
// последняя выкатка забирает бота себе — и вторая среда молча остаётся без
// сообщений, ничем не отличаясь от исправной.
func TestWebhookStolenByAnotherEnvironment(t *testing.T) {
	c := clientAnswering(t, http.StatusOK,
		`{"ok":true,"result":{"url":"https://new.burcev.team/api/v1/public/support/telegram"}}`)

	err := c.VerifyWebhook(context.Background(), ourURL)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not at us")
}

func TestHealthyWebhookPasses(t *testing.T) {
	c := clientAnswering(t, http.StatusOK, `{"ok":true,"result":{"url":"`+ourURL+`"}}`)

	assert.NoError(t, c.VerifyWebhook(context.Background(), ourURL))
}

func TestRevokedTokenIsReported(t *testing.T) {
	c := clientAnswering(t, http.StatusUnauthorized, `{"ok":false}`)

	err := c.VerifyWebhook(context.Background(), ourURL)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "token")
}
