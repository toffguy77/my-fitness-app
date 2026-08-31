package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/admin"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/chat"
	"github.com/burcev/api/internal/modules/content"
	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/modules/dashboard"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/modules/logs"
	"github.com/burcev/api/internal/modules/notifications"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/modules/users"
	"github.com/burcev/api/internal/router"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/openrouter"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/burcev/api/internal/shared/ws"
	"github.com/burcev/api/migrations"
	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize logger
	log := logger.New()
	defer func() { _ = log.Sync() }()

	// Load configuration. validate() joins every problem it finds, so unwrap
	// and print one line each — an operator fixing a broken environment should
	// see the whole list, not discover it one deploy at a time.
	cfg, err := config.Load()
	if err != nil {
		if joined, ok := err.(interface{ Unwrap() []error }); ok {
			for _, problem := range joined.Unwrap() {
				log.Error("Configuration problem", "error", problem)
			}
		}
		log.Fatal("Failed to load configuration", "error", err)
	}

	if cfg.JWTSecretIsUnsafe() {
		log.Warn("JWT_SECRET is unsafe (placeholder or shorter than 32 bytes). "+
			"This is fatal in production; set a random secret.", "env", cfg.Env)
	}
	if disabled := cfg.Features.Disabled(); len(disabled) > 0 {
		log.Warn("Optional capabilities are disabled — the credentials for them are not set",
			"disabled", disabled)
	}

	// Initialize database
	var db *database.DB
	if cfg.DatabaseURL != "" {
		db, err = database.NewPostgresFromURL(cfg.DatabaseURL, cfg.MaxOpenConns, cfg.MaxIdleConns)
	} else {
		db, err = database.NewPostgres(database.PostgresConfig{
			Host:         cfg.DatabaseHost,
			Port:         cfg.DatabasePort,
			Database:     cfg.DatabaseName,
			User:         cfg.DatabaseUser,
			Password:     cfg.DatabasePassword,
			SSLMode:      cfg.DatabaseSSLMode,
			MaxOpenConns: cfg.MaxOpenConns,
			MaxIdleConns: cfg.MaxIdleConns,
		})
	}
	if err != nil {
		log.Fatal("Failed to connect to database", "error", err)
	}
	defer db.Close()

	log.Info("Database connected successfully",
		"host", cfg.DatabaseHost,
		"database", cfg.DatabaseName,
		"max_open_conns", cfg.MaxOpenConns,
	)

	// Run database migrations
	migrator := database.NewMigrator(db, migrations.FS, log)
	if err := migrator.Run(context.Background(), cfg.MigrationBaseline); err != nil {
		log.Fatal("Database migration failed", "error", err)
	}

	// Initialize email service
	emailService, err := email.NewService(email.Config{
		SMTPHost:     cfg.SMTPHost,
		SMTPPort:     cfg.SMTPPort,
		SMTPUsername: cfg.SMTPUsername,
		SMTPPassword: cfg.SMTPPassword,
		FromAddress:  cfg.SMTPFromAddress,
		FromName:     cfg.SMTPFromName,
	}, log)
	if err != nil {
		log.Fatal("Failed to initialize email service", "error", err)
	}

	log.Info("Email service initialized successfully",
		"smtp_host", cfg.SMTPHost,
		"smtp_port", cfg.SMTPPort,
	)

	// Optional S3 clients. Each bucket has its own credentials but falls back
	// to the generic S3_* pair; an absent pair simply leaves the client nil and
	// the corresponding capability disabled (see cfg.Features).
	s3Client := initS3(log, "weekly photos", &storage.S3Config{
		AccessKeyID:     cfg.WeeklyPhotosS3AccessKeyID,
		SecretAccessKey: cfg.WeeklyPhotosS3SecretAccessKey,
		Bucket:          cfg.WeeklyPhotosS3Bucket,
		Region:          cfg.WeeklyPhotosS3Region,
		Endpoint:        cfg.WeeklyPhotosS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})
	profilePhotosS3 := initS3(log, "profile photos", &storage.S3Config{
		AccessKeyID:     cfg.ProfilePhotosS3AccessKeyID,
		SecretAccessKey: cfg.ProfilePhotosS3SecretAccessKey,
		Bucket:          cfg.ProfilePhotosS3Bucket,
		Region:          cfg.ProfilePhotosS3Region,
		Endpoint:        cfg.ProfilePhotosS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})
	chatS3 := initS3(log, "chat", &storage.S3Config{
		AccessKeyID:     cfg.ChatS3AccessKeyID,
		SecretAccessKey: cfg.ChatS3SecretAccessKey,
		Bucket:          cfg.ChatS3Bucket,
		Region:          cfg.ChatS3Region,
		Endpoint:        cfg.ChatS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})
	contentS3 := initS3(log, "content", &storage.S3Config{
		AccessKeyID:     cfg.ContentS3AccessKeyID,
		SecretAccessKey: cfg.ContentS3SecretAccessKey,
		Bucket:          cfg.ContentS3Bucket,
		Region:          cfg.ContentS3Region,
		Endpoint:        cfg.ContentS3Endpoint,
		PathPrefix:      cfg.ContentS3PathPrefix,
	})
	foodPhotosS3 := initS3(log, "food photos", &storage.S3Config{
		AccessKeyID:     cfg.FoodPhotosS3AccessKeyID,
		SecretAccessKey: cfg.FoodPhotosS3SecretAccessKey,
		Bucket:          cfg.FoodPhotosS3Bucket,
		Region:          cfg.FoodPhotosS3Region,
		Endpoint:        cfg.FoodPhotosS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
	})

	// Initialize OpenRouter client (for AI food recognition)
	var orClient *openrouter.Client
	if cfg.OpenRouterAPIKey != "" {
		orClient = openrouter.NewClient(cfg.OpenRouterAPIKey, cfg.OpenRouterModel, log)
		log.Info("OpenRouter client initialized", "model", cfg.OpenRouterModel)
	}

	// Initialize rate limiter (DB-backed, for password reset)
	rateLimiter := middleware.NewRateLimiter(db.DB, log)

	// Initialize auth rate limiter (in-memory sliding window, for login/register)
	authRateLimiter := middleware.NewAuthRateLimiter()

	// Initialize reset service
	resetService := auth.NewResetService(db.DB, cfg, log, emailService, rateLimiter)

	// Set Gin mode
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// WebSocket hub, shared between the REST chat handler and the WS endpoint.
	wsHub := ws.NewHub()

	// Ensure conversations exist for all active curator-client relationships.
	chatService := chat.NewService(db, log)
	if err := chatService.EnsureConversationsExist(context.Background()); err != nil {
		log.Error("Failed to ensure conversations exist", "error", err)
	}

	// Services shared by more than one handler.
	nutritionCalcSvc := nutritioncalc.NewService(db, log)
	notificationsSvc := notifications.NewService(db, log)
	verificationService := auth.NewVerificationService(db.DB, log, emailService)

	var contentS3Uploader content.S3Uploader
	if contentS3 != nil {
		contentS3Uploader = contentS3
	}
	contentService := content.NewService(db, log, contentS3Uploader, wsHub)

	// Routing lives in internal/router, one file per domain.
	router := router.New(router.Deps{
		Cfg:             cfg,
		Log:             log,
		DB:              db,
		AuthRateLimiter: authRateLimiter,

		Auth:          auth.NewHandler(db.DB, cfg, log, verificationService),
		Reset:         auth.NewResetHandler(cfg, log, resetService),
		Users:         users.NewHandler(db.DB, profilePhotosS3, cfg, log, nutritionCalcSvc),
		Notifications: notifications.NewHandler(cfg, log, db),
		Logs:          logs.NewHandler(cfg, log),
		FoodTracker:   foodtracker.NewHandler(cfg, log, db, foodPhotosS3, orClient),
		NutritionCalc: nutritioncalc.NewHandler(cfg, log, db),
		Dashboard:     dashboard.NewHandler(cfg, log, db, s3Client, notificationsSvc, nutritionCalcSvc),
		Chat:          chat.NewHandler(cfg, log, db, chatS3, wsHub),
		Curator:       curator.NewHandler(cfg, log, db, notificationsSvc),
		Admin:         admin.NewHandler(cfg, log, db),
		Content:       content.NewHandler(cfg, log, contentService),
	})

	// Start content scheduler (uses same contentService instance)
	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	defer schedulerCancel()
	go contentService.RunScheduler(schedulerCtx)

	// Create HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Info("Starting server", "port", cfg.Port, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Failed to start server", "error", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown", "error", err)
	}

	log.Info("Server exited")
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
