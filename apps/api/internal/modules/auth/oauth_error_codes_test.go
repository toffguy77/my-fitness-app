package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Клиент показывает перевод кода, а не серверную прозу: messageFor
// предпочитает код. Общий "conflict" переводится как «Действие невозможно в
// текущем состоянии» — то есть сервер знал, что сказать, написал это в
// message, и оно было выброшено по дороге.
func oauthCodeOf(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return body.Code
}

func oauthHandlerWithService(t *testing.T) (*OAuthHandler, sqlmock.Sqlmock) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	service := NewService(db, &config.Config{JWTSecret: "test-secret-key"}, logger.New())
	return NewOAuthHandler(&config.Config{AppDomain: "app.example.com"}, logger.New(),
		service, oauth.NewRegistry()), mock
}

// Отвязать единственный способ входа — это не «действие невозможно в текущем
// состоянии», а «сначала задайте пароль, иначе войти будет нечем».
func TestUnlink_NamesTheOnlyWayIn(t *testing.T) {
	handler, mock := oauthHandlerWithService(t)

	// Запрос переписан веткой landing-conversion: предикат «пароль задан»
	// жил в шести местах и в двух был неверен, поэтому теперь наружу отдаётся
	// сам пароль, а решение принимает единственный PasswordIsSet. Подмена
	// обязана повторять нынешний запрос, иначе тест проверяет вчерашний код.
	mock.ExpectQuery("SELECT u.password,").
		WillReturnRows(sqlmock.NewRows([]string{"password", "link_count"}).AddRow(nil, 1))

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodDelete, "/auth/oauth/yandex/link", nil)
	c.Params = gin.Params{{Key: "provider", Value: "yandex"}}
	c.Set("user_id", int64(1))

	handler.Unlink(c)

	require.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, "provider_only_way_in", oauthCodeOf(t, w))
}

// У аккаунта нет пароля: подтверждать владение нечем, и войти надо через тот
// сервис, который к нему уже привязан. Это конкретный следующий шаг, а не
// «действие невозможно».
func TestConfirmLink_NamesTheAccountWithoutAPassword(t *testing.T) {
	handler, mock := oauthHandlerWithService(t)

	mock.ExpectQuery("FROM oauth_pending_links").
		WillReturnRows(sqlmock.NewRows([]string{"provider", "provider_user_id", "email", "name", "avatar_url"}).
			AddRow("vk", "vk-1", "user@example.com", "User", nil))
	mock.ExpectQuery("SELECT id, password FROM users WHERE email").
		WillReturnRows(sqlmock.NewRows([]string{"id", "password"}).AddRow(int64(7), nil))

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/auth/oauth/link",
		strings.NewReader(`{"password":"whatever"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.AddCookie(&http.Cookie{Name: pendingCookie, Value: "11111111-1111-1111-1111-111111111111"})

	handler.ConfirmLink(c)

	require.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, "password_not_set", oauthCodeOf(t, w))
}
