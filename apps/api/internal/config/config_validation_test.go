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
	t.Setenv("OPENROUTER_API_KEY", "or-key")
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
	// OpenRouter key, so it stays off here.
	assert.Equal(t, []string{"support_bot", "web_push"}, cfg.Features.Disabled())
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
