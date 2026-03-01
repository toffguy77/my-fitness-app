package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

// clearConfigEnv sets all config-related env vars to empty so that Load()
// uses only explicitly provided values. Uses t.Setenv for automatic cleanup.
func clearConfigEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"NODE_ENV", "PORT", "CORS_ORIGIN",
		"DATABASE_URL", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_SSL_MODE",
		"DB_MAX_OPEN_CONNS", "DB_MAX_IDLE_CONNS",
		"SUPABASE_URL", "SUPABASE_SERVICE_KEY",
		"JWT_SECRET",
		"SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM_ADDRESS", "SMTP_FROM_NAME",
		"RESET_PASSWORD_URL",
		"S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET", "S3_REGION", "S3_ENDPOINT",
		"WEEKLY_PHOTOS_S3_ACCESS_KEY_ID", "WEEKLY_PHOTOS_S3_SECRET_ACCESS_KEY",
		"WEEKLY_PHOTOS_S3_BUCKET", "WEEKLY_PHOTOS_S3_REGION", "WEEKLY_PHOTOS_S3_ENDPOINT",
		"PROFILE_PHOTOS_S3_ACCESS_KEY_ID", "PROFILE_PHOTOS_S3_SECRET_ACCESS_KEY",
		"PROFILE_PHOTOS_S3_BUCKET", "PROFILE_PHOTOS_S3_REGION", "PROFILE_PHOTOS_S3_ENDPOINT",
		"CHAT_S3_ACCESS_KEY_ID", "CHAT_S3_SECRET_ACCESS_KEY",
		"CHAT_S3_BUCKET", "CHAT_S3_REGION", "CHAT_S3_ENDPOINT",
		"LOG_LEVEL",
	} {
		t.Setenv(key, "")
		os.Unsetenv(key)
	}
}

func TestLoad(t *testing.T) {
	// Change to a temp directory so godotenv.Load() won't find any .env files.
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(origDir) })
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatal(err)
	}

	t.Run("loads configuration with required env vars", func(t *testing.T) {
		clearConfigEnv(t)
		t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb")
		t.Setenv("PORT", "8080")
		t.Setenv("NODE_ENV", "test")
		t.Setenv("JWT_SECRET", "test-jwt-secret")
		t.Setenv("CORS_ORIGIN", "http://localhost:3000")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.NotNil(t, cfg)
		assert.Equal(t, 8080, cfg.Port)
		assert.Equal(t, "test", cfg.Env)
		assert.Equal(t, "test-jwt-secret", cfg.JWTSecret)
		assert.Equal(t, "http://localhost:3000", cfg.CORSOrigin)
		assert.Equal(t, "postgresql://user:pass@localhost:5432/testdb", cfg.DatabaseURL)
	})

	t.Run("uses default values", func(t *testing.T) {
		clearConfigEnv(t)
		t.Setenv("DB_PASSWORD", "test-password")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.NotNil(t, cfg)
		assert.Equal(t, 4000, cfg.Port)
		assert.Equal(t, "development", cfg.Env)
		assert.Equal(t, "dev-secret-key", cfg.JWTSecret)
		assert.Equal(t, "http://localhost:3000", cfg.CORSOrigin)
		assert.Equal(t, "test-password", cfg.DatabasePassword)
	})

	t.Run("returns error when DATABASE_URL and DB_PASSWORD missing", func(t *testing.T) {
		clearConfigEnv(t)

		cfg, err := Load()

		assert.Error(t, err)
		assert.Nil(t, cfg)
		assert.Contains(t, err.Error(), "DATABASE_URL or DB_PASSWORD")
	})

	t.Run("handles invalid port gracefully", func(t *testing.T) {
		clearConfigEnv(t)
		t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb")
		t.Setenv("PORT", "invalid")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.Equal(t, 4000, cfg.Port)
	})
}
