//go:build integration

package telegramlink_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/modules/telegramlink"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func routerFor(h *telegramlink.Handler, userID int64) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", userID); c.Next() })
	r.GET("/me/telegram", h.Status)
	r.POST("/me/telegram", h.Connect)
	r.DELETE("/me/telegram", h.Disconnect)
	return r
}

func body(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	if data, ok := out["data"].(map[string]any); ok {
		return data
	}
	return out
}

// Имя в настройках — не привязка.
//
// `user_settings.telegram_username` человек вписывает сам, и по нему бот писать
// не умеет: Bot API принимает только числовой chat_id. Профиль, считающий
// заполненное имя подключением, обещает уведомления, которые никогда не придут.
func TestFilledUsernameIsNotALink(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_state")
	ctx := context.Background()
	service := telegramlink.NewService(db.DB)

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('имя@example.test','x','И','client') RETURNING id`).Scan(&userID))
	_, err := db.ExecContext(ctx,
		`INSERT INTO user_settings (user_id, telegram_username) VALUES ($1, 'ivanov')
		 ON CONFLICT (user_id) DO UPDATE SET telegram_username = EXCLUDED.telegram_username`, userID)
	require.NoError(t, err)

	h := telegramlink.NewHandler(service, logger.New(), "burcevteam_bot")
	w := httptest.NewRecorder()
	routerFor(h, userID).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/me/telegram", nil))

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, false, body(t, w)["linked"],
		"профиль считает подключённым того, кому бот написать не может")
}

// Ссылка ведёт на бота и несёт билет.
func TestConnectReturnsALinkToTheBot(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_connect")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('ссылка@example.test','x','С','client') RETURNING id`).Scan(&userID))

	h := telegramlink.NewHandler(telegramlink.NewService(db.DB), logger.New(), "burcevteam_bot")
	w := httptest.NewRecorder()
	routerFor(h, userID).ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/me/telegram", nil))

	require.Equal(t, http.StatusOK, w.Code)
	url, _ := body(t, w)["url"].(string)
	assert.Contains(t, url, "https://t.me/burcevteam_bot?start=")
}

// Бот не настроен — это «недоступно», а не «сломалось».
func TestConnectWithoutABotIsUnavailable(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_nobot")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('нетбота@example.test','x','Н','client') RETURNING id`).Scan(&userID))

	h := telegramlink.NewHandler(telegramlink.NewService(db.DB), logger.New(), "")
	w := httptest.NewRecorder()
	routerFor(h, userID).ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/me/telegram", nil))

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Contains(t, w.Body.String(), "feature_unavailable",
		"отказ без машиночитаемого кода — фронту не на что опереться")
}

// Отвязка возвращает состояние «не подключено» и не падает на повторе.
func TestDisconnect(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "tglink_disconnect")
	ctx := context.Background()
	service := telegramlink.NewService(db.DB)

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('отвяз@example.test','x','О','client') RETURNING id`).Scan(&userID))
	ticket, err := service.Issue(ctx, userID)
	require.NoError(t, err)
	_, err = service.Redeem(ctx, ticket, 9001, "ник")
	require.NoError(t, err)

	h := telegramlink.NewHandler(service, logger.New(), "burcevteam_bot")
	router := routerFor(h, userID)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/me/telegram", nil))
	require.Equal(t, true, body(t, w)["linked"])

	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/me/telegram", nil))
	require.Equal(t, http.StatusOK, w.Code)

	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/me/telegram", nil))
	assert.Equal(t, http.StatusOK, w.Code, "повторная отвязка — не ошибка")

	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/me/telegram", nil))
	assert.Equal(t, false, body(t, w)["linked"])
}
