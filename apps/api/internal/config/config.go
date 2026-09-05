package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/burcev/api/internal/shared/openrouter"
	"github.com/joho/godotenv"
)

// minJWTSecretLen is the minimum acceptable length of JWT_SECRET in bytes.
const minJWTSecretLen = 32

// unsafeJWTSecrets are well-known placeholder values that must never be used
// outside development. They are rejected in production regardless of length.
var unsafeJWTSecrets = map[string]struct{}{
	"dev-secret-key": {},
	"change-me":      {},
	"changeme":       {},
	"secret":         {},
	"test":           {},
}

// Features records which optional capabilities are enabled by the current
// environment. A capability is enabled when its credentials are present.
// Handlers check these flags instead of nil-checking their clients, so a
// disabled capability produces one consistent 503 everywhere.
type Features struct {
	Email           bool
	FoodRecognition bool
	WeeklyPhotos    bool
	ProfileAvatars  bool
	ChatAttachments bool
	ContentMedia    bool
	DataExports     bool
	SupportBot      bool
	WebPush         bool
}

// Disabled returns the names of the capabilities that are turned off, in a
// stable order, for logging at startup.
func (f Features) Disabled() []string {
	var off []string
	for _, c := range []struct {
		name string
		on   bool
	}{
		{"email", f.Email},
		{"food_recognition", f.FoodRecognition},
		{"weekly_photos", f.WeeklyPhotos},
		{"profile_avatars", f.ProfileAvatars},
		{"chat_attachments", f.ChatAttachments},
		{"content_media", f.ContentMedia},
		{"data_exports", f.DataExports},
		{"support_bot", f.SupportBot},
		{"web_push", f.WebPush},
	} {
		if !c.on {
			off = append(off, c.name)
		}
	}
	return off
}

// Map renders the feature flags for the health endpoint.
func (f Features) Map() map[string]bool {
	return map[string]bool{
		"email":            f.Email,
		"food_recognition": f.FoodRecognition,
		"weekly_photos":    f.WeeklyPhotos,
		"profile_avatars":  f.ProfileAvatars,
		"chat_attachments": f.ChatAttachments,
		"content_media":    f.ContentMedia,
		"data_exports":     f.DataExports,
		"support_bot":      f.SupportBot,
		"web_push":         f.WebPush,
	}
}

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
	// ContentS3PathPrefix overrides S3PathPrefix for content only.
	// Defaults to "" because the curator-content bucket has no path prefix
	// (files live at content/{uuid}/body.md, not prod/content/...).
	ContentS3PathPrefix string

	// S3 Path Prefix (dev/ or prod/ — applied to all S3 clients except content)
	S3PathPrefix string

	// Food Photos S3 — falls back to generic S3_* vars
	FoodPhotosS3AccessKeyID     string
	FoodPhotosS3SecretAccessKey string
	FoodPhotosS3Bucket          string
	FoodPhotosS3Region          string
	FoodPhotosS3Endpoint        string

	// Data Exports S3 — archives of a user's own data
	DataExportsS3AccessKeyID     string
	DataExportsS3SecretAccessKey string
	DataExportsS3Bucket          string
	DataExportsS3Region          string
	DataExportsS3Endpoint        string

	// External sign-in providers. Absent credentials mean the provider is
	// simply not offered — a deployment must not show a button that cannot work.
	YandexOAuthClientID     string
	YandexOAuthClientSecret string
	VKOAuthClientID         string
	VKOAuthClientSecret     string

	// OpenRouter (AI food recognition)
	OpenRouterAPIKey          string
	OpenRouterModel           string
	FoodRecognitionDailyLimit int

	// Telegram support bot. Absent credentials disable the capability rather
	// than failing startup: support before registration is optional, and an
	// instance without a bot must answer 503 on its webhook rather than crash.
	// VAPID identifies this service to a browser's push service. Both halves
	// and a contact address are needed; a push sent without them is refused by
	// every push service.
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string

	TelegramBotToken      string
	TelegramWebhookSecret string
	TelegramBotUsername   string
	SupportModel          string
	SupportDailyLimit     int

	// AppDomain is the public domain; drives ResetPasswordURL and email links.
	AppDomain string

	// Version identifies the running build; set from APP_VERSION at deploy time.
	Version string

	// Migrations
	MigrationBaseline int

	// Logging
	LogLevel string

	// Features records which optional capabilities are enabled.
	Features Features
}

// IsProduction reports whether the service runs with production strictness.
func (c *Config) IsProduction() bool {
	return strings.EqualFold(c.Env, "production")
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
		MaxOpenConns:     getEnvAsInt("DB_MAX_OPEN_CONNS", 10),
		MaxIdleConns:     getEnvAsInt("DB_MAX_IDLE_CONNS", 3),

		// Supabase (optional)
		SupabaseURL:        getEnv("SUPABASE_URL", ""),
		SupabaseServiceKey: getEnv("SUPABASE_SERVICE_KEY", ""),

		JWTSecret: getEnv("JWT_SECRET", "dev-secret-key"),

		// Application domain (drives ResetPasswordURL and links in emails)
		AppDomain: getEnv("APP_DOMAIN", ""),
		Version:   getEnv("APP_VERSION", "dev"),

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
		// Default to "" — content files have no prefix in the curator-content bucket
		ContentS3PathPrefix: getEnv("CONTENT_S3_PATH_PREFIX", ""),

		S3PathPrefix: getEnv("S3_PATH_PREFIX", ""),

		// Food Photos S3 — falls back to generic S3_* vars
		FoodPhotosS3AccessKeyID:     getEnvWithFallback("FOOD_PHOTOS_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", ""),
		FoodPhotosS3SecretAccessKey: getEnvWithFallback("FOOD_PHOTOS_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", ""),
		FoodPhotosS3Bucket:          getEnvWithFallback("FOOD_PHOTOS_S3_BUCKET", "S3_BUCKET", "food-photos"),
		FoodPhotosS3Region:          getEnvWithFallback("FOOD_PHOTOS_S3_REGION", "S3_REGION", "ru-central1"),
		FoodPhotosS3Endpoint:        getEnvWithFallback("FOOD_PHOTOS_S3_ENDPOINT", "S3_ENDPOINT", "https://storage.yandexcloud.net"),

		// Data Exports S3 — falls back to generic S3_* vars
		DataExportsS3AccessKeyID:     getEnvWithFallback("DATA_EXPORTS_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", ""),
		DataExportsS3SecretAccessKey: getEnvWithFallback("DATA_EXPORTS_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", ""),
		DataExportsS3Bucket:          getEnvWithFallback("DATA_EXPORTS_S3_BUCKET", "S3_BUCKET", "data-exports"),
		DataExportsS3Region:          getEnvWithFallback("DATA_EXPORTS_S3_REGION", "S3_REGION", "ru-central1"),
		DataExportsS3Endpoint:        getEnvWithFallback("DATA_EXPORTS_S3_ENDPOINT", "S3_ENDPOINT", "https://storage.yandexcloud.net"),

		// External sign-in providers
		YandexOAuthClientID:     getEnv("YANDEX_OAUTH_CLIENT_ID", ""),
		YandexOAuthClientSecret: getEnv("YANDEX_OAUTH_CLIENT_SECRET", ""),
		VKOAuthClientID:         getEnv("VK_OAUTH_CLIENT_ID", ""),
		VKOAuthClientSecret:     getEnv("VK_OAUTH_CLIENT_SECRET", ""),

		// OpenRouter (AI food recognition)
		OpenRouterAPIKey:          getEnv("OPENROUTER_API_KEY", ""),
		OpenRouterModel:           getEnv("OPENROUTER_MODEL", openrouter.DefaultModel),
		VAPIDPublicKey:            getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:           getEnv("VAPID_PRIVATE_KEY", ""),
		VAPIDSubject:              getEnv("VAPID_SUBJECT", ""),
		TelegramBotToken:          getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramWebhookSecret:     getEnv("TELEGRAM_WEBHOOK_SECRET", ""),
		TelegramBotUsername:       getEnv("TELEGRAM_BOT_USERNAME", ""),
		SupportModel:              getEnv("SUPPORT_MODEL", openrouter.DefaultSupportModel),
		SupportDailyLimit:         getEnvAsInt("SUPPORT_DAILY_LIMIT", 500),
		FoodRecognitionDailyLimit: getEnvAsInt("FOOD_RECOGNITION_DAILY_LIMIT", 3),

		MigrationBaseline: getEnvAsInt("DB_MIGRATION_BASELINE", 0),

		LogLevel: getEnv("LOG_LEVEL", "info"),
	}

	cfg.Features = deriveFeatures(cfg)

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// deriveFeatures turns the presence of credentials into capability flags.
func deriveFeatures(c *Config) Features {
	s3 := func(key, secret string) bool { return key != "" && secret != "" }
	return Features{
		Email:           c.SMTPUsername != "" && c.SMTPPassword != "" && c.SMTPFromAddress != "",
		FoodRecognition: c.OpenRouterAPIKey != "",
		WeeklyPhotos:    s3(c.WeeklyPhotosS3AccessKeyID, c.WeeklyPhotosS3SecretAccessKey),
		ProfileAvatars:  s3(c.ProfilePhotosS3AccessKeyID, c.ProfilePhotosS3SecretAccessKey),
		ChatAttachments: s3(c.ChatS3AccessKeyID, c.ChatS3SecretAccessKey),
		ContentMedia:    s3(c.ContentS3AccessKeyID, c.ContentS3SecretAccessKey),
		DataExports:     s3(c.DataExportsS3AccessKeyID, c.DataExportsS3SecretAccessKey),
		// The bot needs all three: a token to reply with, a secret to tell a
		// genuine update from anybody's POST, and a model to answer with.
		SupportBot: c.TelegramBotToken != "" && c.TelegramWebhookSecret != "" && c.OpenRouterAPIKey != "",
		// Both halves of the key pair and a contact address: a push service
		// refuses a request signed without any of them.
		WebPush: c.VAPIDPublicKey != "" && c.VAPIDPrivateKey != "" && c.VAPIDSubject != "",
	}
}

// validate collects every configuration problem and returns them joined, so an
// operator fixes a broken environment in one pass instead of one deploy per
// variable. Required-variable checks apply only in production; development
// keeps working defaults and gets warnings from the caller instead.
func (c *Config) validate() error {
	var problems []error

	if c.DatabaseURL == "" && c.DatabasePassword == "" {
		problems = append(problems, errors.New("DATABASE_URL or DB_PASSWORD is required"))
	}

	if err := c.validateJWTSecret(); err != nil {
		problems = append(problems, err)
	}

	if c.IsProduction() {
		required := []struct {
			name  string
			value string
		}{
			{"SMTP_USERNAME", c.SMTPUsername},
			{"SMTP_PASSWORD", c.SMTPPassword},
			{"SMTP_FROM_ADDRESS", c.SMTPFromAddress},
			{"APP_DOMAIN", c.AppDomain},
		}
		for _, r := range required {
			if r.value == "" {
				problems = append(problems, fmt.Errorf("%s is required when NODE_ENV=production", r.name))
			}
		}
	}

	return errors.Join(problems...)
}

// validateJWTSecret rejects absent, short and placeholder secrets. In
// production this is fatal: booting with a publicly known secret would let
// anyone mint a super_admin token.
func (c *Config) validateJWTSecret() error {
	if !c.IsProduction() {
		return nil
	}
	if c.JWTSecret == "" {
		return errors.New("JWT_SECRET is required when NODE_ENV=production")
	}
	if _, unsafe := unsafeJWTSecrets[strings.ToLower(c.JWTSecret)]; unsafe {
		return errors.New("JWT_SECRET is set to a well-known placeholder value; generate a random secret")
	}
	if len(c.JWTSecret) < minJWTSecretLen {
		return fmt.Errorf("JWT_SECRET must be at least %d bytes, got %d", minJWTSecretLen, len(c.JWTSecret))
	}
	return nil
}

// JWTSecretIsUnsafe reports whether the secret in use is a known placeholder or
// too short. Non-production boots are allowed to continue, but must warn.
func (c *Config) JWTSecretIsUnsafe() bool {
	if _, unsafe := unsafeJWTSecrets[strings.ToLower(c.JWTSecret)]; unsafe {
		return true
	}
	return len(c.JWTSecret) < minJWTSecretLen
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
