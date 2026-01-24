package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLoad(t *testing.T) {
	t.Run("loads configuration with required env vars", func(t *testing.T) {
		// Set required environment variables
		os.Setenv("SUPABASE_URL", "https://test.supabase.co")
		os.Setenv("SUPABASE_SERVICE_KEY", "test-service-key")
		os.Setenv("PORT", "8080")
		os.Setenv("NODE_ENV", "test")
		os.Setenv("JWT_SECRET", "test-jwt-secret")
		os.Setenv("CORS_ORIGIN", "http://localhost:3000")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.NotNil(t, cfg)
		assert.Equal(t, 8080, cfg.Port)
		assert.Equal(t, "test", cfg.Env)
		assert.Equal(t, "test-jwt-secret", cfg.JWTSecret)
		assert.Equal(t, "http://localhost:3000", cfg.CORSOrigin)
		assert.Equal(t, "https://test.supabase.co", cfg.SupabaseURL)
		assert.Equal(t, "test-service-key", cfg.SupabaseServiceKey)

		// Cleanup
		os.Unsetenv("SUPABASE_URL")
		os.Unsetenv("SUPABASE_SERVICE_KEY")
		os.Unsetenv("PORT")
		os.Unsetenv("NODE_ENV")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("CORS_ORIGIN")
	})

	t.Run("uses default values", func(t *testing.T) {
		os.Setenv("SUPABASE_URL", "https://test.supabase.co")
		os.Setenv("SUPABASE_SERVICE_KEY", "test-service-key")
		os.Unsetenv("PORT")
		os.Unsetenv("NODE_ENV")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("CORS_ORIGIN")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.NotNil(t, cfg)
		assert.Equal(t, 4000, cfg.Port) // Default port
		assert.Equal(t, "development", cfg.Env)
		assert.Equal(t, "dev-secret-key", cfg.JWTSecret)
		assert.Equal(t, "http://localhost:3000", cfg.CORSOrigin)

		os.Unsetenv("SUPABASE_URL")
		os.Unsetenv("SUPABASE_SERVICE_KEY")
	})

	t.Run("returns error when SUPABASE_URL missing", func(t *testing.T) {
		os.Unsetenv("SUPABASE_URL")
		os.Setenv("SUPABASE_SERVICE_KEY", "test-service-key")

		cfg, err := Load()

		assert.Error(t, err)
		assert.Nil(t, cfg)
		assert.Contains(t, err.Error(), "SUPABASE_URL")

		os.Unsetenv("SUPABASE_SERVICE_KEY")
	})

	t.Run("returns error when SUPABASE_SERVICE_KEY missing", func(t *testing.T) {
		os.Setenv("SUPABASE_URL", "https://test.supabase.co")
		os.Unsetenv("SUPABASE_SERVICE_KEY")

		cfg, err := Load()

		assert.Error(t, err)
		assert.Nil(t, cfg)
		assert.Contains(t, err.Error(), "SUPABASE_SERVICE_KEY")

		os.Unsetenv("SUPABASE_URL")
	})

	t.Run("handles invalid port gracefully", func(t *testing.T) {
		os.Setenv("SUPABASE_URL", "https://test.supabase.co")
		os.Setenv("SUPABASE_SERVICE_KEY", "test-service-key")
		os.Setenv("PORT", "invalid")

		cfg, err := Load()

		assert.NoError(t, err)
		assert.Equal(t, 4000, cfg.Port) // Falls back to default

		os.Unsetenv("SUPABASE_URL")
		os.Unsetenv("SUPABASE_SERVICE_KEY")
		os.Unsetenv("PORT")
	})
}
