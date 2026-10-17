package router

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func configEngine(t *testing.T, cfg *config.Config, pingErr error) *gin.Engine {
	t.Helper()
	db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	if pingErr != nil {
		mock.ExpectPing().WillReturnError(pingErr)
	} else {
		mock.ExpectPing()
	}
	gin.SetMode(gin.TestMode)
	return New(Deps{
		Cfg:             cfg,
		Log:             logger.New(),
		DB:              &database.DB{DB: db},
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
	})
}

func decode(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(raw, &body))
	return body
}

// «База недоступна»: /ready отвечает 503, /config — 200 с прежними
// значениями.
func TestConfigAnswersWhileTheDatabaseIsDown(t *testing.T) {
	cfg := &config.Config{Env: "test", AppDomain: "burcev.team", IOSMinSupportedVersion: "0.4.0",
		Features: config.Features{FoodRecognition: true}}
	engine := configEngine(t, cfg, assert.AnError)

	ready := get(engine, "/ready")
	require.Equal(t, http.StatusServiceUnavailable, ready.Code)

	w := get(engine, "/api/v1/config")
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "no-store", w.Header().Get("Cache-Control"))

	body := decode(t, w.Body.Bytes())
	assert.Equal(t, map[string]any{"min_supported_version": "0.4.0"}, body["ios"])
	assert.Equal(t, "mailto:support@burcev.team", body["support_url"])
	assert.Equal(t, map[string]any{
		"terms_url":   "https://burcev.team/legal/terms",
		"privacy_url": "https://burcev.team/legal/privacy",
	}, body["legal"])
	assert.Equal(t, true, body["features"].(map[string]any)["food_recognition"])
}

// «Возможность выключена»: features в /config и /ready совпадают целиком —
// это один построитель.
func TestConfigAndReadyReportTheSameFeatures(t *testing.T) {
	for name, features := range map[string]config.Features{
		"all off":            {},
		"recognition off":    {Email: true, WeeklyPhotos: true, AppleSignIn: true},
		"recognition on":     {FoodRecognition: true, APNS: true},
		"apple sign-in only": {AppleSignIn: true},
	} {
		t.Run(name, func(t *testing.T) {
			engine := configEngine(t, &config.Config{Env: "test", Features: features}, nil)

			ready := decode(t, get(engine, "/ready").Body.Bytes())["features"]
			cfg := decode(t, get(engine, "/api/v1/config").Body.Bytes())["features"]

			require.NotNil(t, ready)
			assert.Equal(t, ready, cfg)
			assert.Equal(t, features.FoodRecognition, cfg.(map[string]any)["food_recognition"])
			assert.Contains(t, cfg, "apple_sign_in")
			// push-devices «Ключ не задан»: features.apns — false и в /config,
			// и в /ready (они равны целиком строкой выше).
			assert.Equal(t, features.APNS, cfg.(map[string]any)["apns"])
		})
	}
}

// Без IOS_MIN_SUPPORTED_VERSION поле — 0.0.0; неверное значение вне прода
// (в проде старт не состоится) тоже отдаётся как 0.0.0, а не как строка,
// которую приложение не разберёт.
func TestConfigMinimumVersionDefaults(t *testing.T) {
	for _, value := range []string{"", "1.2"} {
		engine := configEngine(t, &config.Config{Env: "test", IOSMinSupportedVersion: value}, nil)
		body := decode(t, get(engine, "/api/v1/config").Body.Bytes())
		assert.Equal(t, map[string]any{"min_supported_version": "0.0.0"}, body["ios"], value)
	}
}

// Публичный: без авторизации.
func TestConfigIsPublic(t *testing.T) {
	assert.Equal(t, http.StatusOK, get(testEngine(t), "/api/v1/config").Code)
}
