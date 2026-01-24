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

	// PostgreSQL
	DatabaseURL      string
	DatabaseHost     string
	DatabasePort     int
	DatabaseName     string
	DatabaseUser     string
	DatabasePassword string
	DatabaseSSLMode  string
	MaxOpenConns     int
	MaxIdleConns     int

	// Supabase (optional, for migration compatibility)
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

		// PostgreSQL configuration
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		DatabaseHost:     getEnv("DB_HOST", "localhost"),
		DatabasePort:     getEnvAsInt("DB_PORT", 5432),
		DatabaseName:     getEnv("DB_NAME", "web-app-db"),
		DatabaseUser:     getEnv("DB_USER", "web-app-user"),
		DatabasePassword: getEnv("DB_PASSWORD", ""),
		DatabaseSSLMode:  getEnv("DB_SSL_MODE", "require"),
		MaxOpenConns:     getEnvAsInt("DB_MAX_OPEN_CONNS", 25),
		MaxIdleConns:     getEnvAsInt("DB_MAX_IDLE_CONNS", 5),

		// Supabase (optional)
		SupabaseURL:        getEnv("SUPABASE_URL", ""),
		SupabaseServiceKey: getEnv("SUPABASE_SERVICE_KEY", ""),

		JWTSecret: getEnv("JWT_SECRET", "dev-secret-key"),

		LogLevel: getEnv("LOG_LEVEL", "info"),
	}

	// Validate required configuration
	if cfg.DatabaseURL == "" && cfg.DatabasePassword == "" {
		return nil, fmt.Errorf("DATABASE_URL or DB_PASSWORD is required")
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
