package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLoad(t *testing.T) {
	t.Run("loads configuration with required env vars", func(t *testing.T) {
		// Set required environment variables
		_ = os.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb")
		_ = os.Setenv("PORT", "8080")
		_ = os.Setenv("NODE_ENV", "test")
		_ = os.Setenv("JWT_SECRET", "test-jwt-secret")
		_ = os.Setenv("CORS_ORIGIN", "http://localhost:3000")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.NotNil(t, cfg)
		assert.Equal(t, 8080, cfg.Port)
		assert.Equal(t, "test", cfg.Env)
		assert.Equal(t, "test-jwt-secret", cfg.JWTSecret)
		assert.Equal(t, "http://localhost:3000", cfg.CORSOrigin)
		assert.Equal(t, "postgresql://user:pass@localhost:5432/testdb", cfg.DatabaseURL)

		// Cleanup
		_ = os.Unsetenv("DATABASE_URL")
		_ = os.Unsetenv("PORT")
		_ = os.Unsetenv("NODE_ENV")
		_ = os.Unsetenv("JWT_SECRET")
		_ = os.Unsetenv("CORS_ORIGIN")
	})

	t.Run("uses default values", func(t *testing.T) {
		_ = os.Setenv("DB_PASSWORD", "test-password")
		_ = os.Unsetenv("DATABASE_URL")
		_ = os.Unsetenv("PORT")
		_ = os.Unsetenv("NODE_ENV")
		_ = os.Unsetenv("JWT_SECRET")
		_ = os.Unsetenv("CORS_ORIGIN")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.NotNil(t, cfg)
		assert.Equal(t, 4000, cfg.Port) // Default port
		assert.Equal(t, "development", cfg.Env)
		assert.Equal(t, "dev-secret-key", cfg.JWTSecret)
		assert.Equal(t, "http://localhost:3000", cfg.CORSOrigin)
		assert.Equal(t, "test-password", cfg.DatabasePassword)

		_ = os.Unsetenv("DB_PASSWORD")
	})

	t.Run("returns error when DATABASE_URL and DB_PASSWORD missing", func(t *testing.T) {
		_ = os.Unsetenv("DATABASE_URL")
		_ = os.Unsetenv("DB_PASSWORD")

		cfg, err := Load()

		assert.Error(t, err)
		assert.Nil(t, cfg)
		assert.Contains(t, err.Error(), "DATABASE_URL or DB_PASSWORD")
	})

	t.Run("handles invalid port gracefully", func(t *testing.T) {
		_ = os.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb")
		_ = os.Setenv("PORT", "invalid")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.Equal(t, 4000, cfg.Port) // Falls back to default

		_ = os.Unsetenv("DATABASE_URL")
		_ = os.Unsetenv("PORT")
	})
}
