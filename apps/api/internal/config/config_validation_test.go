package config

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// loadIn runs Load() from a temp directory so godotenv can't pick up a real
// .env file and leak developer credentials into the assertions.
func loadIn(t *testing.T) (*Config, error) {
	t.Helper()
	origDir, err := os.Getwd()
	require.NoError(t, err)
	require.NoError(t, os.Chdir(t.TempDir()))
	t.Cleanup(func() { _ = os.Chdir(origDir) })
	return Load()
}

// prodEnv sets a complete, valid production environment. Individual tests
// break one variable at a time to assert the corresponding failure.
func prodEnv(t *testing.T) {
	t.Helper()
	clearConfigEnv(t)
	for _, k := range []string{
		"OPENROUTER_API_KEY", "OPENROUTER_MODEL", "FOOD_RECOGNITION_DAILY_LIMIT",
		"CONTENT_S3_ACCESS_KEY_ID", "CONTENT_S3_SECRET_ACCESS_KEY",
		"FOOD_PHOTOS_S3_ACCESS_KEY_ID", "FOOD_PHOTOS_S3_SECRET_ACCESS_KEY",
		"S3_PATH_PREFIX", "CONTENT_S3_PATH_PREFIX", "DB_MIGRATION_BASELINE",
	} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
	t.Setenv("NODE_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://user:pass@host:5432/db")
	t.Setenv("JWT_SECRET", strings.Repeat("a", 48))
	t.Setenv("SMTP_USERNAME", "support@burcev.team")
	t.Setenv("SMTP_PASSWORD", "smtp-password")
	t.Setenv("SMTP_FROM_ADDRESS", "support@burcev.team")
	t.Setenv("APP_DOMAIN", "burcev.team")
}

func TestValidate_ProductionComplete(t *testing.T) {
	prodEnv(t)

	cfg, err := loadIn(t)

	require.NoError(t, err)
	assert.True(t, cfg.IsProduction())
}

func TestValidate_ProductionMissingJWTSecret(t *testing.T) {
	prodEnv(t)
	t.Setenv("JWT_SECRET", "")
	os.Unsetenv("JWT_SECRET")

	_, err := loadIn(t)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "JWT_SECRET")
}

func TestValidate_ProductionPlaceholderJWTSecret(t *testing.T) {
	prodEnv(t)
	t.Setenv("JWT_SECRET", "dev-secret-key")

	_, err := loadIn(t)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "placeholder")
}

func TestValidate_ProductionShortJWTSecret(t *testing.T) {
	prodEnv(t)
	t.Setenv("JWT_SECRET", strings.Repeat("a", 16))

	_, err := loadIn(t)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "at least 32 bytes")
}

// A broken environment must surface every problem at once; fixing one variable
// per deploy is what this validation exists to prevent.
func TestValidate_ProductionReportsAllProblems(t *testing.T) {
	prodEnv(t)
	t.Setenv("JWT_SECRET", "")
	os.Unsetenv("JWT_SECRET")
	t.Setenv("SMTP_PASSWORD", "")
	os.Unsetenv("SMTP_PASSWORD")

	_, err := loadIn(t)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "JWT_SECRET")
	assert.Contains(t, err.Error(), "SMTP_PASSWORD")
}

func TestValidate_ProductionMissingAppDomain(t *testing.T) {
	prodEnv(t)
	t.Setenv("APP_DOMAIN", "")
	os.Unsetenv("APP_DOMAIN")

	_, err := loadIn(t)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "APP_DOMAIN")
}

// Development must keep booting without a full environment; the unsafe default
// is reported through JWTSecretIsUnsafe so the caller can warn.
func TestValidate_DevelopmentAllowsDefaults(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("NODE_ENV", "development")
	t.Setenv("DB_PASSWORD", "local")

	cfg, err := loadIn(t)

	require.NoError(t, err)
	assert.False(t, cfg.IsProduction())
	assert.True(t, cfg.JWTSecretIsUnsafe(), "default dev secret must be reported as unsafe")
}

func TestValidate_MissingDatabase(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("NODE_ENV", "development")

	_, err := loadIn(t)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "DATABASE_URL or DB_PASSWORD")
}

func TestFeatures_DerivedFromCredentials(t *testing.T) {
	prodEnv(t)
	// Ключа мало: имя модели включает идентификатор каталога и умолчания не
	// имеет. Возможность, включённая по одному ключу, отвечала бы отказом на
	// каждый запрос, продолжая числиться доступной.
	t.Setenv("LLM_API_KEY", "llm-key")
	// Зрение — отдельный поставщик: текстовая модель принимает картинку и молча
	// её игнорирует, поэтому распознавание еды включается своими настройками.
	t.Setenv("VISION_API_KEY", "vision-key")
	t.Setenv("VISION_MODEL", "провайдер/модель-со-зрением")
	t.Setenv("S3_ACCESS_KEY_ID", "key")
	t.Setenv("S3_SECRET_ACCESS_KEY", "secret")

	cfg, err := loadIn(t)

	require.NoError(t, err)
	assert.True(t, cfg.Features.FoodRecognition)
	assert.True(t, cfg.Features.Email)
	// The generic S3_* pair is the documented fallback for every bucket.
	assert.True(t, cfg.Features.WeeklyPhotos)
	assert.True(t, cfg.Features.ChatAttachments)
	assert.True(t, cfg.Features.DataExports)
	// The support bot needs a Telegram token and webhook secret on top of the
	// model credentials, so it stays off here; the observability pair needs its
	// own credentials and is off for the same reason. Мост переписки требует
	// сверх того идентификатор форум-группы — её создаёт человек, и вывести её
	// из учётных данных нельзя.
	// Обратная связь рекламному кабинету выключена по той же причине: токен
	// привязан к живому человеку, и вывести его из учётных данных нельзя.
	assert.Equal(t, []string{
		"support_bot", "support_bridge", "web_push",
		"error_reporting", "tracing", "ads_attribution",
	}, cfg.Features.Disabled())
}

func TestFeatures_DisabledWhenCredentialsAbsent(t *testing.T) {
	prodEnv(t)

	cfg, err := loadIn(t)

	require.NoError(t, err)
	assert.False(t, cfg.Features.FoodRecognition)
	assert.False(t, cfg.Features.WeeklyPhotos)
	assert.Contains(t, cfg.Features.Disabled(), "food_recognition")
	assert.Contains(t, cfg.Features.Map(), "food_recognition")
	assert.False(t, cfg.Features.Map()["food_recognition"])
}

// Способность, которую никто не проверял во включённом состоянии.
//
// Так она и уехала на прод мёртвой: поле в структуре было, в списке
// выключенных значилось, а присваивания в deriveFeatures не было вовсе.
// Проверка «выключена без учётных данных» это пропускала — она проходит и
// тогда, когда признак не вычисляется никогда.
func TestFeatures_AdsAttributionOnWithBothCredentials(t *testing.T) {
	prodEnv(t)
	t.Setenv("YANDEX_METRIKA_OAUTH_TOKEN", "oauth-token")
	t.Setenv("YANDEX_METRIKA_COUNTER_ID", "107159088")

	cfg, err := loadIn(t)

	require.NoError(t, err)
	assert.True(t, cfg.Features.AdsAttribution)
	assert.NotContains(t, cfg.Features.Disabled(), "ads_attribution")
	assert.True(t, cfg.Features.Map()["ads_attribution"])
}

// Токен без счётчика некуда загружать, счётчик без токена не пишется.
func TestFeatures_AdsAttributionNeedsBoth(t *testing.T) {
	for _, only := range []struct {
		name  string
		key   string
		value string
	}{
		{"только токен", "YANDEX_METRIKA_OAUTH_TOKEN", "oauth-token"},
		{"только счётчик", "YANDEX_METRIKA_COUNTER_ID", "107159088"},
	} {
		t.Run(only.name, func(t *testing.T) {
			prodEnv(t)
			t.Setenv(only.key, only.value)

			cfg, err := loadIn(t)

			require.NoError(t, err)
			assert.False(t, cfg.Features.AdsAttribution)
			assert.Contains(t, cfg.Features.Disabled(), "ads_attribution")
		})
	}
}
