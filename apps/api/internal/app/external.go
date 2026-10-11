package app

import (
	"fmt"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/llm"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/burcev/api/internal/shared/telemetry"
)

// External holds the clients that reach outside the process: mail, object
// storage and the vision model. Build takes them ready-made so that a test can
// hand in its own at exactly this boundary and leave everything behind it real.
//
// Every field may be nil: that is how an optional capability is off.
type External struct {
	Email *email.Service

	WeeklyPhotos  *storage.S3Client
	ProfilePhotos *storage.S3Client
	Chat          *storage.S3Client
	Content       *storage.S3Client
	DataExports   *storage.S3Client
	FoodPhotos    *storage.S3Client

	// Vision recognises food in a photograph.
	Vision *llm.Client
}

// NewExternal builds the clients from configuration. Missing credentials leave
// a client nil; only a mail server that is configured and cannot be set up is
// an error.
func NewExternal(cfg *config.Config, log *logger.Logger) (External, error) {
	var ext External

	// Email is an optional capability. In production the config validation
	// above already requires the SMTP settings, so reaching the disabled branch
	// there is impossible; elsewhere — local development, the e2e environment —
	// the service starts without a mail server and the flows that need one
	// decline with 503 rather than preventing startup.
	if cfg.Features.Email {
		emailService, err := email.NewService(email.Config{
			SMTPHost:     cfg.SMTPHost,
			SMTPPort:     cfg.SMTPPort,
			SMTPUsername: cfg.SMTPUsername,
			SMTPPassword: cfg.SMTPPassword,
			FromAddress:  cfg.SMTPFromAddress,
			FromName:     cfg.SMTPFromName,
			ReplyTo:      cfg.SMTPReplyTo,
		}, log)
		if err != nil {
			return External{}, fmt.Errorf("initialize email service: %w", err)
		}
		ext.Email = emailService
		log.Info("Email service initialized", "smtp_host", cfg.SMTPHost, "smtp_port", cfg.SMTPPort)
	} else {
		log.Warn("Email is disabled: SMTP settings are not configured. " +
			"Verification and password recovery will decline with 503.")
	}

	// Optional S3 clients. Each bucket has its own credentials but falls back
	// to the generic S3_* pair; an absent pair simply leaves the client nil and
	// the corresponding capability disabled (see cfg.Features).
	ext.WeeklyPhotos = initS3(log, "weekly photos", &storage.S3Config{
		AccessKeyID:     cfg.WeeklyPhotosS3AccessKeyID,
		SecretAccessKey: cfg.WeeklyPhotosS3SecretAccessKey,
		Bucket:          cfg.WeeklyPhotosS3Bucket,
		Region:          cfg.WeeklyPhotosS3Region,
		Endpoint:        cfg.WeeklyPhotosS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})
	ext.ProfilePhotos = initS3(log, "profile photos", &storage.S3Config{
		AccessKeyID:     cfg.ProfilePhotosS3AccessKeyID,
		SecretAccessKey: cfg.ProfilePhotosS3SecretAccessKey,
		Bucket:          cfg.ProfilePhotosS3Bucket,
		Region:          cfg.ProfilePhotosS3Region,
		Endpoint:        cfg.ProfilePhotosS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})
	ext.Chat = initS3(log, "chat", &storage.S3Config{
		AccessKeyID:     cfg.ChatS3AccessKeyID,
		SecretAccessKey: cfg.ChatS3SecretAccessKey,
		Bucket:          cfg.ChatS3Bucket,
		Region:          cfg.ChatS3Region,
		Endpoint:        cfg.ChatS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})
	ext.Content = initS3(log, "content", &storage.S3Config{
		AccessKeyID:     cfg.ContentS3AccessKeyID,
		SecretAccessKey: cfg.ContentS3SecretAccessKey,
		Bucket:          cfg.ContentS3Bucket,
		Region:          cfg.ContentS3Region,
		Endpoint:        cfg.ContentS3Endpoint,
		PathPrefix:      cfg.ContentS3PathPrefix,
	})
	ext.DataExports = initS3(log, "data exports", &storage.S3Config{
		AccessKeyID:     cfg.DataExportsS3AccessKeyID,
		SecretAccessKey: cfg.DataExportsS3SecretAccessKey,
		Bucket:          cfg.DataExportsS3Bucket,
		Region:          cfg.DataExportsS3Region,
		Endpoint:        cfg.DataExportsS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})
	ext.FoodPhotos = initS3(log, "food photos", &storage.S3Config{
		AccessKeyID:     cfg.FoodPhotosS3AccessKeyID,
		SecretAccessKey: cfg.FoodPhotosS3SecretAccessKey,
		Bucket:          cfg.FoodPhotosS3Bucket,
		Region:          cfg.FoodPhotosS3Region,
		Endpoint:        cfg.FoodPhotosS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})

	// Клиент модели со зрением — для распознавания еды по фото.
	//
	// Оба нужны: ключ без имени модели — это запрос, который отклонят, а
	// возможность при этом числилась бы настроенной.
	if cfg.VisionAPIKey != "" && cfg.VisionModel != "" {
		// Распознавание еды идёт к поставщику со зрением, а не к текстовому.
		// Общий клиент означал бы выдуманный состав блюда: текстовая модель
		// принимает запрос с картинкой, молча её игнорирует и отвечает по
		// одному тексту — с кодом 200.
		ext.Vision = llm.NewClient(cfg.VisionAPIKey, cfg.VisionModel, log).
			WithEndpoint(cfg.VisionBaseURL, cfg.VisionAuthScheme).
			WithUsageObserver(telemetry.RecordModelUsage)
		log.Info("Vision model client initialized", "model", cfg.VisionModel)
	}

	return ext, nil
}

// initS3 builds an optional S3 client. Missing credentials are not an error:
// the capability is simply off, which config.Features already reports at
// startup and handlers answer with 503.
func initS3(log *logger.Logger, name string, c *storage.S3Config) *storage.S3Client {
	if c.AccessKeyID == "" || c.SecretAccessKey == "" {
		return nil
	}
	client, err := storage.NewS3Client(c, log)
	if err != nil {
		log.Error("Failed to initialize S3 client", "client", name, "error", err)
		return nil
	}
	log.Info("S3 client initialized", "client", name, "bucket", c.Bucket)
	return client
}
