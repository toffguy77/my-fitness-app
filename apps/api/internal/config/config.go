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

	// SMTP Configuration (Yandex Mail)
	SMTPHost        string
	SMTPPort        int
	SMTPUsername    string
	SMTPPassword    string
	SMTPFromAddress string
	SMTPFromName    string

	// Password Reset
	ResetPasswordURL string

	// Weekly Photos S3 (Object Storage)
	WeeklyPhotosS3AccessKeyID     string
	WeeklyPhotosS3SecretAccessKey string
	WeeklyPhotosS3Bucket          string
	WeeklyPhotosS3Region          string
	WeeklyPhotosS3Endpoint        string

	// Profile Photos S3 (separate bucket/credentials)
	ProfilePhotosS3AccessKeyID     string
	ProfilePhotosS3SecretAccessKey string
	ProfilePhotosS3Bucket          string
	ProfilePhotosS3Region          string
	ProfilePhotosS3Endpoint        string

	// Logging
	LogLevel string
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Load .env file if exists (for local development)
	// Try multiple locations: current dir, project root (when running from apps/api)
	_ = godotenv.Load()             // ./env
	_ = godotenv.Load("../../.env") // project root when running from apps/api

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

		// SMTP Configuration (Yandex Mail)
		SMTPHost:        getEnv("SMTP_HOST", "smtp.yandex.ru"),
		SMTPPort:        getEnvAsInt("SMTP_PORT", 465),
		SMTPUsername:    getEnv("SMTP_USERNAME", ""),
		SMTPPassword:    getEnv("SMTP_PASSWORD", ""),
		SMTPFromAddress: getEnv("SMTP_FROM_ADDRESS", ""),
		SMTPFromName:    getEnv("SMTP_FROM_NAME", "BURCEV"),

		// Password Reset
		ResetPasswordURL: getEnv("RESET_PASSWORD_URL", "http://localhost:3000/reset-password"),

		// Weekly Photos S3 (Object Storage)
		WeeklyPhotosS3AccessKeyID:     getEnv("WEEKLY_PHOTOS_S3_ACCESS_KEY_ID", ""),
		WeeklyPhotosS3SecretAccessKey: getEnv("WEEKLY_PHOTOS_S3_SECRET_ACCESS_KEY", ""),
		WeeklyPhotosS3Bucket:          getEnv("WEEKLY_PHOTOS_S3_BUCKET", "weekly-progress-photos"),
		WeeklyPhotosS3Region:          getEnv("WEEKLY_PHOTOS_S3_REGION", "ru-central1"),
		WeeklyPhotosS3Endpoint:        getEnv("WEEKLY_PHOTOS_S3_ENDPOINT", "https://storage.yandexcloud.net"),

		// Profile Photos S3 (separate bucket/credentials)
		ProfilePhotosS3AccessKeyID:     getEnv("PROFILE_PHOTOS_S3_ACCESS_KEY_ID", ""),
		ProfilePhotosS3SecretAccessKey: getEnv("PROFILE_PHOTOS_S3_SECRET_ACCESS_KEY", ""),
		ProfilePhotosS3Bucket:          getEnv("PROFILE_PHOTOS_S3_BUCKET", "profiles-photos"),
		ProfilePhotosS3Region:          getEnv("PROFILE_PHOTOS_S3_REGION", "ru-central1"),
		ProfilePhotosS3Endpoint:        getEnv("PROFILE_PHOTOS_S3_ENDPOINT", "https://storage.yandexcloud.net"),

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
