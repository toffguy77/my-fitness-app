package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds application configuration
type Config struct {
	Env  string
	Port int

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

	// Chat S3 (attachments, images in chat)
	ChatS3AccessKeyID     string
	ChatS3SecretAccessKey string
	ChatS3Bucket          string
	ChatS3Region          string
	ChatS3Endpoint        string

	// Content S3
	ContentS3AccessKeyID     string
	ContentS3SecretAccessKey string
	ContentS3Bucket          string
	ContentS3Region          string
	ContentS3Endpoint        string

	// S3 Path Prefix (dev/ or prod/ — applied to all S3 clients)
	S3PathPrefix string

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
		Env:  getEnv("NODE_ENV", "development"),
		Port: getEnvAsInt("PORT", 4000),

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
		ResetPasswordURL: getResetPasswordURL(),

		// Weekly Photos S3 (Object Storage) — falls back to generic S3_* vars
		WeeklyPhotosS3AccessKeyID:     getEnvWithFallback("WEEKLY_PHOTOS_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", ""),
		WeeklyPhotosS3SecretAccessKey: getEnvWithFallback("WEEKLY_PHOTOS_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", ""),
		WeeklyPhotosS3Bucket:          getEnvWithFallback("WEEKLY_PHOTOS_S3_BUCKET", "S3_BUCKET", "weekly-progress-photos"),
		WeeklyPhotosS3Region:          getEnvWithFallback("WEEKLY_PHOTOS_S3_REGION", "S3_REGION", "ru-central1"),
		WeeklyPhotosS3Endpoint:        getEnvWithFallback("WEEKLY_PHOTOS_S3_ENDPOINT", "S3_ENDPOINT", "https://storage.yandexcloud.net"),

		// Profile Photos S3 — falls back to generic S3_* vars (same account, different bucket)
		ProfilePhotosS3AccessKeyID:     getEnvWithFallback("PROFILE_PHOTOS_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", ""),
		ProfilePhotosS3SecretAccessKey: getEnvWithFallback("PROFILE_PHOTOS_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", ""),
		ProfilePhotosS3Bucket:          getEnvWithFallback("PROFILE_PHOTOS_S3_BUCKET", "S3_BUCKET", "profiles-photos"),
		ProfilePhotosS3Region:          getEnvWithFallback("PROFILE_PHOTOS_S3_REGION", "S3_REGION", "ru-central1"),
		ProfilePhotosS3Endpoint:        getEnvWithFallback("PROFILE_PHOTOS_S3_ENDPOINT", "S3_ENDPOINT", "https://storage.yandexcloud.net"),

		// Chat S3 — falls back to generic S3_* vars
		ChatS3AccessKeyID:     getEnvWithFallback("CHAT_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", ""),
		ChatS3SecretAccessKey: getEnvWithFallback("CHAT_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", ""),
		ChatS3Bucket:          getEnvWithFallback("CHAT_S3_BUCKET", "S3_BUCKET", "chats"),
		ChatS3Region:          getEnvWithFallback("CHAT_S3_REGION", "S3_REGION", "ru-central1"),
		ChatS3Endpoint:        getEnvWithFallback("CHAT_S3_ENDPOINT", "S3_ENDPOINT", "https://storage.yandexcloud.net"),

		// Content S3 — falls back to generic S3_* vars
		ContentS3AccessKeyID:     getEnvWithFallback("CONTENT_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", ""),
		ContentS3SecretAccessKey: getEnvWithFallback("CONTENT_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", ""),
		ContentS3Bucket:          getEnvWithFallback("CONTENT_S3_BUCKET", "S3_BUCKET", "curator-content"),
		ContentS3Region:          getEnvWithFallback("CONTENT_S3_REGION", "S3_REGION", "ru-central1"),
		ContentS3Endpoint:        getEnvWithFallback("CONTENT_S3_ENDPOINT", "S3_ENDPOINT", "https://storage.yandexcloud.net"),

		S3PathPrefix: getEnv("S3_PATH_PREFIX", ""),

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

func getEnvWithFallback(key, fallbackKey, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	if value := os.Getenv(fallbackKey); value != "" {
		return value
	}
	return defaultValue
}

func getResetPasswordURL() string {
	if domain := os.Getenv("APP_DOMAIN"); domain != "" {
		return "https://" + domain + "/reset-password"
	}
	return "http://localhost:3069/reset-password"
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return defaultValue
}
