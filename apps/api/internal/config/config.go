package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds application configuration
type Config struct {
	Env        string
	Port       int
	CORSOrigin string

	// Supabase
	SupabaseURL        string
	SupabaseServiceKey string

	// JWT
	JWTSecret string

	// Logging
	LogLevel string
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Load .env file if exists (for local development)
	_ = godotenv.Load()

	cfg := &Config{
		Env:        getEnv("NODE_ENV", "development"),
		Port:       getEnvAsInt("PORT", 4000),
		CORSOrigin: getEnv("CORS_ORIGIN", "http://localhost:3000"),

		SupabaseURL:        getEnv("SUPABASE_URL", ""),
		SupabaseServiceKey: getEnv("SUPABASE_SERVICE_KEY", ""),

		JWTSecret: getEnv("JWT_SECRET", "dev-secret-key"),

		LogLevel: getEnv("LOG_LEVEL", "info"),
	}

	// Validate required configuration
	if cfg.SupabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL is required")
	}
	if cfg.SupabaseServiceKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_KEY is required")
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return defaultValue
}
