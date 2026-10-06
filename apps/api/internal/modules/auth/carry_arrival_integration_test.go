//go:build integration

package auth_test

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The way in, end to end: the browser's first-touch cookie reaches
// user_attribution on the paths that can be driven without a provider. The
// provider path is held by TestEveryAccountPathCarriesArrival.
func TestEveryAccountPathRecordsAttribution(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "carry_arrival")
	ctx := context.Background()
	log := logger.New()
	svc := auth.NewService(db.DB, &config.Config{}, log)
	leadsSvc := leads.NewService(db.DB, log, "carry-arrival-secret")
	handler := auth.NewHandler(svc, &config.Config{}, log, nil).WithLeads(leadsSvc)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/auth/register", handler.Register)
	router.POST("/auth/magic-link/consume", handler.ConsumeMagicLink)

	firstTouch := &http.Cookie{
		Name:  leads.FirstTouchCookieName,
		Value: url.QueryEscape(`{"referrer":"https://dzen.ru/a/xyz","landing_page":"/content/chto-takoe-kbzhu"}`),
	}

	post := func(path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		for _, c := range cookies {
			req.AddCookie(c)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}

	referrerOf := func(email string) (string, bool) {
		var referrer sql.NullString
		err := db.QueryRowContext(ctx, `
			SELECT a.referrer FROM user_attribution a JOIN users u ON u.id = a.user_id
			WHERE u.email = $1`, email).Scan(&referrer)
		if err == sql.ErrNoRows {
			return "", false
		}
		require.NoError(t, err)
		return referrer.String, true
	}

	t.Run("форма регистрации", func(t *testing.T) {
		w := post("/auth/register",
			`{"email":"password@example.test","password":"Str0ng-Passw0rd!","name":"Пароль",`+
				`"consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`,
			firstTouch)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

		referrer, ok := referrerOf("password@example.test")
		require.True(t, ok, "регистрация паролем без заявки оставила учётную запись без источника")
		assert.Equal(t, "https://dzen.ru/a/xyz", referrer)
	})

	t.Run("вход по одноразовой ссылке создаёт учётную запись", func(t *testing.T) {
		token := seedMagicLinkWithConsents(t, db.DB, auth.NewTokenGenerator(), "link@example.test",
			`{"terms_of_service":true,"privacy_policy":true,"data_processing":true,"marketing":false}`)

		w := post("/auth/magic-link/consume", `{"token":"`+token+`"}`, firstTouch)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())

		referrer, ok := referrerOf("link@example.test")
		require.True(t, ok)
		assert.Equal(t, "https://dzen.ru/a/xyz", referrer)
	})

	// Scenario: Вход в существующую учётную запись — источник пишется только
	// при создании.
	t.Run("вход в существующую учётную запись ничего не пишет", func(t *testing.T) {
		_, err := db.ExecContext(ctx,
			`INSERT INTO users (email, password, name, role, email_verified) VALUES ('old@example.test', 'x', 'Старый', 'client', true)`)
		require.NoError(t, err)
		sender := &capturingSender{}
		consents := &auth.ConsentsInput{TermsOfService: true, PrivacyPolicy: true, DataProcessing: true}
		require.NoError(t, auth.NewService(db.DB, &config.Config{}, log).WithEmailService(sender).
			RequestMagicLink(ctx, "old@example.test", consents, "127.0.0.1", "test"))
		require.Len(t, sender.calls, 1)
		token := tokenFromMagicLinkURL(t, sender.calls[0].MagicLinkURL)

		w := post("/auth/magic-link/consume", `{"token":"`+token+`"}`, firstTouch)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())

		_, ok := referrerOf("old@example.test")
		assert.False(t, ok)
	})

	// Scenario: Повреждённая запись
	t.Run("повреждённая cookie не мешает регистрации", func(t *testing.T) {
		w := post("/auth/register",
			`{"email":"broken@example.test","password":"Str0ng-Passw0rd!","name":"Сломано",`+
				`"consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`,
			&http.Cookie{Name: leads.FirstTouchCookieName, Value: "%7Bbroken"})
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

		_, ok := referrerOf("broken@example.test")
		assert.False(t, ok)
	})
}
