//go:build integration

package auth

import (
	"context"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/analytics"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Доля входов через провайдеров считается ровно из этих событий, и больше
// ниоткуда: запрос задачи 10.2 отбирает `properties->>'method'` по именам
// провайдеров.
//
// Запись событий — «по возможности»: событие, не прошедшее словарь, пишется в
// журнал и выбрасывается. Молчание здесь — худший исход, потому что пустая
// метрика неотличима от «никто не приходил». Так и было: в `method` клали
// `oauth.Provider`, интерфейс, а не имя. Ошибки не возникало — `map[string]any`
// принимает что угодно, а `encoding/json` сериализует такой объект в `{}`.
// Событие ложилось в таблицу, выглядело живым в подсчёте и не совпадало с
// запросом метрики ни разу.
//
// На настоящей базе, а не на подмене: подмена подтвердила бы вызов, а вопрос
// здесь — что именно оказалось в строке.
func TestRecordOutcome_WritesTheProviderNameTheMetricLooksFor(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "oauth_analytics")
	ctx := context.Background()

	var userID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, name, role) VALUES ('провайдер@example.test', 'Вошедший', 'client')
		 RETURNING id`).Scan(&userID))

	registry := oauth.NewRegistry()
	registry.Register(oauth.NewYandex("test-client", "test-secret"))
	h := NewOAuthHandler(&config.Config{AppDomain: "app.example.test"}, logger.New(), nil, registry).
		WithAnalytics(analytics.NewService(db.DB, logger.New()))

	outcome := &OAuthOutcome{Result: OAuthRegistered, User: &LoginResult{User: &User{ID: userID}}}

	for _, c := range []struct {
		result OAuthResult
		event  string
	}{
		{OAuthRegistered, analytics.EventRegistered},
		{OAuthSignedIn, analytics.EventSignedIn},
	} {
		outcome.Result = c.result
		h.recordOutcome(ctx, outcome, "yandex")

		var method *string
		err := db.QueryRowContext(ctx,
			`SELECT properties->>'method' FROM analytics_events
			  WHERE name = $1 AND user_id = $2`, c.event, userID).Scan(&method)
		require.NoError(t, err, "события %q нет вовсе — словарь его отверг молча", c.event)
		require.NotNil(t, method, "у %q нет method — запрос метрики его не найдёт", c.event)
		assert.Equal(t, "yandex", *method,
			"в method лежит не имя провайдера: метрика останется пустой навсегда")
	}
}

// Отсутствие получателя не должно ронять вход: аналитика никогда не причина
// отказа в регистрации.
func TestRecordOutcome_SurvivesWithoutARecorder(t *testing.T) {
	h := NewOAuthHandler(&config.Config{}, logger.New(), nil, oauth.NewRegistry())
	h.recordOutcome(context.Background(),
		&OAuthOutcome{Result: OAuthSignedIn, User: &LoginResult{User: &User{ID: 1}}}, "vk")
}
