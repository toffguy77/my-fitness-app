package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/llm"
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
	SupportBridge   bool
	WebPush         bool
	// APNS — уведомления на iPhone через APNs: ключ .p8 с правом APNs,
	// его идентификатор и команда Apple. Хост (sandbox или production)
	// выбирается по окружению, с которым зарегистрировалось устройство.
	APNS bool
	// AppleSignIn — вход через Apple из приложения: команда, bundle id и ключ
	// с правом Sign in with Apple. Без всех четырёх провайдер выключен.
	AppleSignIn bool
	// Observability, reported for the same reason as the rest: "is it on?" has
	// to be answerable from outside, or the only way to find out is to break
	// something and see whether anybody hears.
	ErrorReporting bool
	Tracing        bool
	// AdsAttribution reports product facts to the advertising account. Off
	// without a token: local development has no business holding one, and an
	// upload signed with nothing would fail on every run.
	AdsAttribution bool
	// RecipeImport — импорт рецептов ВкусВилла в черновики. Нужны адрес MCP
	// (по умолчанию задан) и хранилище контента: фото копируются к нам, а
	// черновик со ссылками на чужой сервер — не то, что обещает спека.
	RecipeImport bool
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
		{"support_bridge", f.SupportBridge},
		{"web_push", f.WebPush},
		{"apns", f.APNS},
		{"apple_sign_in", f.AppleSignIn},
		{"error_reporting", f.ErrorReporting},
		{"tracing", f.Tracing},
		{"ads_attribution", f.AdsAttribution},
		{"recipe_import", f.RecipeImport},
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
		"support_bridge":   f.SupportBridge,
		"web_push":         f.WebPush,
		"apns":             f.APNS,
		"apple_sign_in":    f.AppleSignIn,
		"error_reporting":  f.ErrorReporting,
		"tracing":          f.Tracing,
		"ads_attribution":  f.AdsAttribution,
		"recipe_import":    f.RecipeImport,
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

	// JWT
	JWTSecret string

	// SMTP Configuration (Yandex Mail)
	SMTPHost        string
	SMTPPort        int
	SMTPUsername    string
	SMTPPassword    string
	SMTPFromAddress string
	SMTPFromName    string
	// SMTPReplyTo is where a person who answers a letter actually reaches us.
	// Письма уходят с noreply@ — без этого заголовка ответ уходил бы в ящик,
	// который никто не открывает.
	SMTPReplyTo string

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
	// OAuthYandexBaseURL replaces the Yandex endpoints with `<base>/authorize`,
	// `<base>/token` and `<base>/info` — the stub the end-to-end suite signs up
	// through (scripts/oauth-stub.mjs). Like LLM_BASE_URL, it points the
	// service at somebody other than the real provider, so production refuses
	// to start with it set: a sign-in answered by an arbitrary server is an
	// account handed to whoever runs that server.
	OAuthYandexBaseURL string
	// OAuthAppOrigin is the origin the external sign-in flow returns the
	// browser to, when it is not `https://` + APP_DOMAIN. Locally and under
	// test the browser has to come back through the routing proxy on 3070:
	// the default, Next on 3069, drops Set-Cookie on the way to the API, and
	// the flow cannot finish without its cookies. Refused in production, where
	// APP_DOMAIN is the origin.
	OAuthAppOrigin string

	// Модели: текст и зрение
	LLMAPIKey                 string
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

	// APNs подписывает запросы ключом .p8 (ES256). Ключ создаётся в
	// developer.apple.com → Keys с правом «Apple Push Notifications service».
	// APNSTopic — bundle id приложения: Apple доставляет только ему.
	APNSKeyID      string
	APNSTeamID     string
	APNSPrivateKey string
	APNSTopic      string

	// Sign in with Apple. Ключ создаётся в developer.apple.com → Keys с
	// правом «Sign in with Apple»; AppleBundleID — audience identity token'а.
	AppleTeamID     string
	AppleBundleID   string
	AppleKeyID      string
	ApplePrivateKey string
	// AppleTokenEncryptionKey — 32 байта в base64, ключ AES-256-GCM, которым
	// зашифрованы refresh-токены Apple в базе (external_identities,
	// oauth_pending_links, apple_token_revocations). Отдельный секрет, а не
	// производная JWT_SECRET: смена того не должна осиротить сохранённые
	// токены, без которых доступ у Apple не отозвать.
	AppleTokenEncryptionKey string

	// IOSMinSupportedVersion — минимальная версия iOS-приложения, с которой
	// сервер ещё работает (MAJOR.MINOR.PATCH). Отдаётся в GET /api/v1/config;
	// приложение ниже неё просит обновиться.
	IOSMinSupportedVersion string

	TelegramBotToken      string
	TelegramWebhookSecret string
	TelegramBotUsername   string
	// TelegramSupportGroupID — форум-группа кураторов. Ноль означает, что мост
	// выключен: переписка идёт по-старому, а не ломается.
	TelegramSupportGroupID int64
	// TelegramAlertsThreadID — тема той же группы, куда бот пишет служебные
	// оповещения: заявку на куратора и напоминание о ней. Отдельная тема нужна
	// потому, что в общей ленте такие сообщения путаются с разговором
	// участников проекта и теряются. Ноль — писать в общую ленту, как раньше.
	TelegramAlertsThreadID int64
	SupportModel           string
	// LLMBaseURL и LLMAuthScheme описывают поставщика модели. Вместе, а не по
	// отдельности: адрес без схемы авторизации — это запрос, который отклонят.
	LLMBaseURL    string
	LLMAuthScheme string
	// Зрение настраивается отдельно от текста, и это необходимость, а не
	// удобство: поставщик текста изображения не принимает — запрос проходит с
	// кодом 200, картинка молча игнорируется. Общая настройка означала бы
	// выдуманный состав блюда вместо честного отказа.
	VisionAPIKey      string
	VisionModel       string
	VisionBaseURL     string
	VisionAuthScheme  string
	SupportDailyLimit int

	// NotificationEmailDelay is how long a notification is given to be read in
	// the application before it is worth an email. Zero uses the default.
	NotificationEmailDelay time.Duration

	// AppDomain is the public domain; drives ResetPasswordURL and email links.
	AppDomain string

	// Version identifies the running build; set from APP_VERSION at deploy time.
	Version string

	// Observability. Both are optional: absent, the capability is off and the
	// startup log says so.
	SentryDSN    string
	OTLPEndpoint string

	// Web analytics, for reporting conversions back to the advertising
	// account. Optional: without both the capability is off.
	MetrikaOAuthToken string
	MetrikaCounterID  string

	// VkusvillMCPURL — адрес MCP ВкусВилла для импорта рецептов. Пусто —
	// импорт выключен (VKUSVILL_MCP_URL=off).
	VkusvillMCPURL string

	// Migrations
	MigrationBaseline int

	// Logging
	LogLevel string

	// Features records which optional capabilities are enabled.
	Features Features
}

// IsProduction reports whether the service runs with production strictness.
//
// Both spellings count. The deployment calls it "prod" and Node calls it
// "production"; accepting only one of them would silently turn off the strict
// startup checks in the environment that needs them most.
func (c *Config) IsProduction() bool {
	return strings.EqualFold(c.Env, "production") || strings.EqualFold(c.Env, "prod")
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Load .env file if exists (for local development)
	// Try multiple locations: current dir, project root (when running from apps/api)
	_ = godotenv.Load()             // ./env
	_ = godotenv.Load("../../.env") // project root when running from apps/api

	cfg := &Config{
		// APP_ENV first, NODE_ENV only as a fallback.
		//
		// NODE_ENV is a Node.js convention, and compose set it to "production"
		// for this Go service in both environments — so dev called itself
		// production in its health answer, its logs, and, once error reporting
		// is switched on, in every report it would file. Dokploy has always set
		// APP_ENV correctly per environment; nothing was reading it.
		Env:  getEnvWithFallback("APP_ENV", "NODE_ENV", "development"),
		Port: getEnvAsInt("PORT", 4000),

		// PostgreSQL configuration
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		DatabaseHost:     getEnv("DB_HOST", "localhost"),
		DatabasePort:     getEnvAsInt("DB_PORT", 5432),
		DatabaseName:     getEnv("DB_NAME", "web-app-db"),
		DatabaseUser:     getEnv("DB_USER", "web-app-user"),
		DatabasePassword: getEnv("DB_PASSWORD", ""),
		DatabaseSSLMode:  getEnv("DB_SSL_MODE", "require"),
		// Размер пула задаётся окружением на каждом развёртывании; значения
		// здесь — для локального запуска, а не для прода. Прод на дефолте
		// 2026-09-29 упёрся в них: десяти соединений не хватило, когда человек
		// открыл дашборд, который дёргает около десятка запросов сразу.
		MaxOpenConns: getEnvAsInt("DB_MAX_OPEN_CONNS", 30),
		MaxIdleConns: getEnvAsInt("DB_MAX_IDLE_CONNS", 10),

		JWTSecret: getEnv("JWT_SECRET", "dev-secret-key"),

		// Application domain (drives ResetPasswordURL and links in emails)
		AppDomain:         getEnv("APP_DOMAIN", ""),
		Version:           getEnv("APP_VERSION", "dev"),
		SentryDSN:         getEnv("SENTRY_DSN", ""),
		MetrikaOAuthToken: getEnv("YANDEX_METRIKA_OAUTH_TOKEN", ""),
		MetrikaCounterID:  getEnv("YANDEX_METRIKA_COUNTER_ID", ""),
		VkusvillMCPURL:    vkusvillMCPURL(getEnv("VKUSVILL_MCP_URL", DefaultVkusvillMCPURL)),
		OTLPEndpoint:      getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", ""),

		// SMTP Configuration (Yandex Mail)
		SMTPHost:        getEnv("SMTP_HOST", "smtp.yandex.ru"),
		SMTPPort:        getEnvAsInt("SMTP_PORT", 465),
		SMTPUsername:    getEnv("SMTP_USERNAME", ""),
		SMTPPassword:    getEnv("SMTP_PASSWORD", ""),
		SMTPFromAddress: getEnv("SMTP_FROM_ADDRESS", ""),
		SMTPFromName:    getEnv("SMTP_FROM_NAME", "BURCEV"),
		SMTPReplyTo:     getEnv("SMTP_REPLY_TO", "support@burcev.team"),

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
		OAuthYandexBaseURL:      strings.TrimRight(getEnv("OAUTH_YANDEX_BASE_URL", ""), "/"),
		OAuthAppOrigin:          strings.TrimRight(getEnv("OAUTH_APP_ORIGIN", ""), "/"),

		// Модель: распознавание еды и бот поддержки.
		//
		// Имена переменных больше не называют поставщика: он сменился с
		// OpenRouter на Yandex Foundation Models, и названия, привязанные к
		// одному из них, врали бы при следующей смене. Прежние имена приняты
		// как запасные, чтобы окружение можно было перевести не в один миг.
		LLMAPIKey:     getEnvWithFallback("LLM_API_KEY", "OPENROUTER_API_KEY", ""),
		LLMBaseURL:    getEnv("LLM_BASE_URL", llm.DefaultBaseURL),
		LLMAuthScheme: getEnv("LLM_AUTH_SCHEME", llm.DefaultAuthScheme),

		// Зрение — свой поставщик, и это необходимость, а не удобство. Ни одна
		// модель в каталоге поставщика текста не принимает изображения: запрос
		// проходит с кодом 200, картинка молча игнорируется, и ответ строится
		// по одному тексту. Для распознавания еды это выдуманный состав блюда,
		// поданный как результат, — хуже, чем честный отказ.
		VisionAPIKey:     getEnvWithFallback("VISION_API_KEY", "OPENROUTER_API_KEY", ""),
		VisionModel:      getEnvWithFallback("VISION_MODEL", "OPENROUTER_MODEL", ""),
		VisionBaseURL:    getEnv("VISION_BASE_URL", visionDefaultBaseURL()),
		VisionAuthScheme: getEnv("VISION_AUTH_SCHEME", visionDefaultAuthScheme()),

		VAPIDPublicKey:            getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:           getEnv("VAPID_PRIVATE_KEY", ""),
		VAPIDSubject:              getEnv("VAPID_SUBJECT", ""),
		APNSKeyID:                 getEnv("APNS_KEY_ID", ""),
		APNSTeamID:                getEnv("APNS_TEAM_ID", ""),
		APNSPrivateKey:            getEnv("APNS_PRIVATE_KEY", ""),
		APNSTopic:                 getEnv("APNS_TOPIC", "team.burcev.app"),
		AppleTeamID:               getEnv("APPLE_TEAM_ID", ""),
		AppleBundleID:             getEnv("APPLE_BUNDLE_ID", ""),
		AppleKeyID:                getEnv("APPLE_KEY_ID", ""),
		ApplePrivateKey:           getEnv("APPLE_PRIVATE_KEY", ""),
		AppleTokenEncryptionKey:   getEnv("APPLE_TOKEN_ENCRYPTION_KEY", ""),
		IOSMinSupportedVersion:    getEnv("IOS_MIN_SUPPORTED_VERSION", DefaultIOSMinSupportedVersion),
		TelegramBotToken:          getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramWebhookSecret:     getEnv("TELEGRAM_WEBHOOK_SECRET", ""),
		TelegramBotUsername:       getEnv("TELEGRAM_BOT_USERNAME", ""),
		TelegramSupportGroupID:    getEnvAsInt64("TELEGRAM_SUPPORT_GROUP_ID", 0),
		TelegramAlertsThreadID:    getEnvAsInt64("TELEGRAM_ALERTS_THREAD_ID", 0),
		SupportModel:              getEnv("SUPPORT_MODEL", ""),
		SupportDailyLimit:         getEnvAsInt("SUPPORT_DAILY_LIMIT", 500),
		NotificationEmailDelay:    getEnvAsDuration("NOTIFICATION_EMAIL_DELAY", 0),
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

// Умолчания поставщика зрения зависят от того, какими именами задан ключ.
//
// Установка, настроенная по старым именам OPENROUTER_*, имела связный смысл:
// ключ OpenRouter и умолчания, указывающие на OpenRouter. Если теперь отдать
// ей яндексовые умолчания, её ключ полетит на чужой эндпоинт с чужой схемой
// авторизации, и она получит отказ, из которого ничего не понять. Поэтому
// старое имя тянет за собой старые умолчания — а новое имя новые.
//
// Явно заданные VISION_BASE_URL и VISION_AUTH_SCHEME сильнее обоих.
const (
	openRouterBaseURL    = "https://openrouter.ai/api/v1/chat/completions"
	openRouterAuthScheme = "Bearer"
)

func configuredByLegacyOpenRouterNames() bool {
	return os.Getenv("VISION_API_KEY") == "" && os.Getenv("OPENROUTER_API_KEY") != ""
}

func visionDefaultBaseURL() string {
	if configuredByLegacyOpenRouterNames() {
		return openRouterBaseURL
	}
	return llm.DefaultBaseURL
}

func visionDefaultAuthScheme() string {
	if configuredByLegacyOpenRouterNames() {
		return openRouterAuthScheme
	}
	return llm.DefaultAuthScheme
}

// DefaultVkusvillMCPURL — публичный MCP ВкусВилла; авторизации для рецептов
// не требует.
const DefaultVkusvillMCPURL = "https://mcp.vkusvill.ru/mcp"

// vkusvillMCPURL выключает импорт значением "off".
//
// У адреса есть умолчание, поэтому пустое значение выключить его не может:
// getEnv подставит умолчание, а compose передаёт пустую строку, когда
// переменная не задана. Нужен явный выключатель.
func vkusvillMCPURL(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "off") {
		return ""
	}
	return value
}

// ValidAppleTokenEncryptionKey reports whether value is 32 bytes in standard
// base64 — an AES-256 key.
func ValidAppleTokenEncryptionKey(value string) bool {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(value))
	return err == nil && len(key) == 32
}

// DefaultIOSMinSupportedVersion — значение без IOS_MIN_SUPPORTED_VERSION:
// обновляться не требуется никому.
const DefaultIOSMinSupportedVersion = "0.0.0"

var iosVersionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

// ValidIOSVersion reports whether value is MAJOR.MINOR.PATCH.
func ValidIOSVersion(value string) bool {
	return iosVersionPattern.MatchString(value)
}

// deriveFeatures turns the presence of credentials into capability flags.
func deriveFeatures(c *Config) Features {
	s3 := func(key, secret string) bool { return key != "" && secret != "" }
	return Features{
		Email: c.SMTPUsername != "" && c.SMTPPassword != "" && c.SMTPFromAddress != "",
		// Ключа мало: у имени модели нет умолчания, потому что оно включает
		// идентификатор каталога и у каждой установки своё. Запрос без имени
		// отклоняется, и возможность, числящаяся включённой по одному ключу,
		// снова врала бы.
		//
		// Поставщик зрения больше не отдельный: в каталоге Яндекса есть модель,
		// принимающая изображения, и живёт она на том же эндпоинте, что и
		// текстовая. Проверено настоящим запросом — изображение в base64
		// доходит и описывается. Раньше здесь стояло, что таких моделей в
		// каталоге нет; это было верно и увело умолчание на OpenRouter,
		// который здесь не оплачивается (см. llm.DefaultBaseURL).
		//
		// У модели есть своя ловушка, и она закрыта в llm.RecognizeFood: без
		// явного отключения размышления она возвращает пустое содержание.
		FoodRecognition: c.VisionAPIKey != "" && c.VisionModel != "",
		WeeklyPhotos:    s3(c.WeeklyPhotosS3AccessKeyID, c.WeeklyPhotosS3SecretAccessKey),
		ProfileAvatars:  s3(c.ProfilePhotosS3AccessKeyID, c.ProfilePhotosS3SecretAccessKey),
		ChatAttachments: s3(c.ChatS3AccessKeyID, c.ChatS3SecretAccessKey),
		ContentMedia:    s3(c.ContentS3AccessKeyID, c.ContentS3SecretAccessKey),
		DataExports:     s3(c.DataExportsS3AccessKeyID, c.DataExportsS3SecretAccessKey),
		// The bot needs all three: a token to reply with, a secret to tell a
		// genuine update from anybody's POST, and a model to answer with.
		SupportBot: c.TelegramBotToken != "" && c.TelegramWebhookSecret != "" &&
			c.LLMAPIKey != "" && c.SupportModel != "",
		// Мост переписки: бот и заданная группа. Права бота в группе отсюда не
		// видны — их спрашивают у Telegram ежечасной проверкой, потому что
		// право можно снять в интерфейсе группы, и настройки об этом не узнают.
		SupportBridge: c.TelegramBotToken != "" && c.TelegramSupportGroupID != 0,
		// Both halves of the key pair and a contact address: a push service
		// refuses a request signed without any of them.
		WebPush: c.VAPIDPublicKey != "" && c.VAPIDPrivateKey != "" && c.VAPIDSubject != "",
		// Ключ без идентификатора или команды Apple не принимает.
		APNS: c.APNSKeyID != "" && c.APNSTeamID != "" && c.APNSPrivateKey != "",
		// Без команды и ключа не подписать client secret для обмена кода и
		// отзыва, без bundle id не проверить audience identity token'а.
		// Без ключа шифрования токен Apple негде хранить, а без него не
		// отозвать доступ при удалении аккаунта (Guideline 5.1.1(v)).
		AppleSignIn: c.AppleTeamID != "" && c.AppleBundleID != "" &&
			c.AppleKeyID != "" && c.ApplePrivateKey != "" &&
			ValidAppleTokenEncryptionKey(c.AppleTokenEncryptionKey),

		// Обе разом: токен без счётчика некуда загружать, счётчик без токена
		// не пишется.
		AdsAttribution: c.MetrikaOAuthToken != "" && c.MetrikaCounterID != "",

		ErrorReporting: c.SentryDSN != "",

		RecipeImport: c.VkusvillMCPURL != "" &&
			s3(c.ContentS3AccessKeyID, c.ContentS3SecretAccessKey),

		// Наличие адреса — намерение, а не результат: экспортёр ещё должен
		// подняться. Пока он не поднялся, признак остаётся выключенным, и
		// main.go включает его сам, получив ответ от StartTracing.
		//
		// Отличие от остальных возможностей здесь по существу: у прочих
		// наличие ключа и есть работоспособность, а трассировка на проде
		// месяц числилась включённой, ни разу не стартовав — SDK отказывал
		// на расхождении версий схемы, отказ уходил в лог, а /health
		// сообщал «tracing: true».
		Tracing: false,
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

	// Версия в неверном формате в проде — ошибка, а не тихое «0.0.0»: иначе
	// опечатка в панели отключила бы требование обновиться у всех, и никто бы
	// этого не заметил. Вне прода — только предупреждение вызывающего.
	if c.IsProduction() && !ValidIOSVersion(c.IOSMinSupportedVersion) {
		problems = append(problems, fmt.Errorf(
			"IOS_MIN_SUPPORTED_VERSION must be MAJOR.MINOR.PATCH (e.g. 1.2.0), got %q",
			c.IOSMinSupportedVersion))
	}

	// Apple настроена, а ключа шифрования нет или он не того вида: вход
	// через Apple молча выключился бы, и в проде это ошибка, а не WARN.
	appleConfigured := c.AppleTeamID != "" && c.AppleBundleID != "" &&
		c.AppleKeyID != "" && c.ApplePrivateKey != ""
	if c.IsProduction() && appleConfigured && !ValidAppleTokenEncryptionKey(c.AppleTokenEncryptionKey) {
		problems = append(problems, errors.New(
			"APPLE_TOKEN_ENCRYPTION_KEY must be 32 random bytes in base64 (openssl rand -base64 32) when Sign in with Apple is configured"))
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

		// Test-only overrides of the external sign-in. Either one in
		// production would let a server other than the provider decide who
		// is signing in, or send the browser somewhere other than the site.
		forbidden := []struct {
			name  string
			value string
		}{
			{"OAUTH_YANDEX_BASE_URL", c.OAuthYandexBaseURL},
			{"OAUTH_APP_ORIGIN", c.OAuthAppOrigin},
		}
		for _, f := range forbidden {
			if f.value != "" {
				problems = append(problems, fmt.Errorf("%s must not be set when NODE_ENV=production: it is for local runs and the end-to-end suite only", f.name))
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

// getEnvAsDuration reads a Go duration such as "30m" or "2s". An unreadable
// value falls back rather than failing the boot: a mistyped tuning knob should
// not take the service down.
func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	if value, err := time.ParseDuration(getEnv(key, "")); err == nil {
		return value
	}
	return defaultValue
}

// getEnvAsInt64 читает целое, не помещающееся в int на 32-битных сборках.
//
// Идентификатор супергруппы Telegram — как раз такой: -1003907264482.
func getEnvAsInt64(key string, defaultValue int64) int64 {
	if value, err := strconv.ParseInt(getEnv(key, ""), 10, 64); err == nil {
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
