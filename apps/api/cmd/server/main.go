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
	"github.com/burcev/api/internal/jobsetup"
	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/modules/admin"
	"github.com/burcev/api/internal/modules/analytics"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/modules/chat"
	"github.com/burcev/api/internal/modules/content"
	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/modules/dashboard"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/modules/logs"
	"github.com/burcev/api/internal/modules/notifications"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/modules/support"
	"github.com/burcev/api/internal/modules/users"
	"github.com/burcev/api/internal/router"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/jobs"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/openrouter"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/burcev/api/internal/shared/telegram"
	"github.com/burcev/api/internal/shared/telemetry"
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
	defer func() { _ = db.Close() }()

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

	// Email is an optional capability. In production the config validation
	// above already requires the SMTP settings, so reaching the disabled branch
	// there is impossible; elsewhere — local development, the e2e environment —
	// the service starts without a mail server and the flows that need one
	// decline with 503 rather than preventing startup.
	var emailService *email.Service
	if cfg.Features.Email {
		emailService, err = email.NewService(email.Config{
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
		log.Info("Email service initialized", "smtp_host", cfg.SMTPHost, "smtp_port", cfg.SMTPPort)
	} else {
		log.Warn("Email is disabled: SMTP settings are not configured. " +
			"Verification and password recovery will decline with 503.")
	}

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
	dataExportsS3 := initS3(log, "data exports", &storage.S3Config{
		AccessKeyID:     cfg.DataExportsS3AccessKeyID,
		SecretAccessKey: cfg.DataExportsS3SecretAccessKey,
		Bucket:          cfg.DataExportsS3Bucket,
		Region:          cfg.DataExportsS3Region,
		Endpoint:        cfg.DataExportsS3Endpoint,
		PathPrefix:      cfg.S3PathPrefix,
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
	notificationsSvc.WithPush(notifications.PushConfig{
		PublicKey:  cfg.VAPIDPublicKey,
		PrivateKey: cfg.VAPIDPrivateKey,
		Subject:    cfg.VAPIDSubject,
	})
	// The digest needs a way to send and a secret to sign unsubscribe links
	// with. Without SMTP it is simply not wired, and the job says so.
	if emailService != nil {
		notificationsSvc.WithDigest(
			func(ctx context.Context, to, name string, items []notifications.DigestItem, unsubscribeURL string) error {
				data := email.DigestEmailData{
					UserEmail:      to,
					Name:           name,
					AppURL:         appOrigin(cfg.AppDomain),
					UnsubscribeURL: unsubscribeURL,
				}
				for _, item := range items {
					data.Items = append(data.Items, email.DigestItemData{
						Title:     item.Title,
						Content:   item.Content,
						ActionURL: item.ActionURL,
						CreatedAt: item.CreatedAt,
					})
				}
				return emailService.SendNotificationDigest(ctx, data)
			},
			cfg.JWTSecret,
			appOrigin(cfg.AppDomain),
		)
	}
	verificationService := auth.NewVerificationService(db.DB, log, emailService)

	// Only providers with credentials are registered, so an unconfigured one
	// is absent rather than broken.
	oauthRegistry := oauth.NewRegistry()
	if p := oauth.NewYandex(cfg.YandexOAuthClientID, cfg.YandexOAuthClientSecret); p != nil {
		oauthRegistry.Register(p)
		log.Info("External sign-in provider registered", "provider", p.Name())
	}
	if p := oauth.NewVK(cfg.VKOAuthClientID, cfg.VKOAuthClientSecret); p != nil {
		oauthRegistry.Register(p)
		log.Info("External sign-in provider registered", "provider", p.Name())
	}
	if !oauthRegistry.Enabled() {
		log.Warn("No external sign-in providers configured; only password sign-in is available")
	}
	authService := auth.NewService(db.DB, cfg, log)

	var contentS3Uploader content.S3Uploader
	if contentS3 != nil {
		contentS3Uploader = contentS3
	}
	contentService := content.NewService(db, log, contentS3Uploader, wsHub)
	// Shared with the curator handler so the snapshot jobs and the HTTP layer
	// read the same code path.
	curatorService := curator.NewService(db, log, notificationsSvc)

	// Erasure must reach every store that holds user files; a bucket missing
	// from this map is data that survives an account deletion.
	accountService := account.NewService(db, log, map[string]*storage.S3Client{
		"weekly-photos":  s3Client,
		"profile-photos": profilePhotosS3,
		"chat":           chatS3,
		"food-photos":    foodPhotosS3,
		"exports":        dataExportsS3,
	}).WithNotifier(notificationsSvc)

	analyticsService := analytics.NewService(db.DB, log)

	// Leads outlive the browser session they were created in, so their resume
	// links are signed with the same secret that signs sessions.
	leadsService := leads.NewService(db.DB, log, cfg.JWTSecret)

	// Support bot. Absent credentials mean no bot at all rather than a broken
	// one: the routes are not registered and the capability reports itself off.
	var supportService *support.Service
	if cfg.Features.SupportBot {
		supportService = support.NewService(
			db.DB, log,
			openrouter.NewClient(cfg.OpenRouterAPIKey, cfg.SupportModel, log),
			telegram.NewClient(cfg.TelegramBotToken),
			leadsService,
			cfg.SupportDailyLimit,
		)
	} else {
		log.Warn("Support bot is disabled", "reason", "TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or OPENROUTER_API_KEY is absent")
	}

	// Periodic work. Every job takes a PostgreSQL advisory lock, so running
	// more than one instance does not run the work twice, and every execution
	// is recorded — which is what makes "are snapshots being collected?"
	// answerable at all.
	moscow, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		log.Warn("Failed to load Europe/Moscow; scheduling jobs in UTC", "error", err)
		moscow = time.UTC
	}
	metrics := telemetry.New("burcev", db.DB.Stats)
	// The domain counters were declared and never incremented; installing the
	// recorder is what lets the services reach them without threading a
	// metrics handle through every constructor.
	telemetry.SetDefault(metrics)

	jobRegistry := jobs.NewRegistry()
	scheduler := jobs.NewScheduler(db.DB, jobRegistry, log, moscow)
	scheduler.SetObserver(func(name string, status jobs.Status, d time.Duration, _ int) {
		metrics.ObserveJob(name, string(status), d)
	})
	jobsetup.Register(jobRegistry, jobsetup.Deps{
		Account:       accountService,
		Auth:          authService,
		Content:       contentService,
		Curator:       curatorService,
		Analytics:     analyticsService,
		Leads:         leadsService,
		Notifications: notificationsSvc,
		Support:       supportService,
		Email:         emailService,
		AppDomain:     cfg.AppDomain,
		RateLimiter:   rateLimiter,
		Scheduler:     scheduler,
	})

	// Routing lives in internal/router, one file per domain.
	router := router.New(router.Deps{
		Cfg:             cfg,
		Log:             log,
		DB:              db,
		AuthRateLimiter: authRateLimiter,

		Analytics:     analytics.NewHandler(analyticsService, log),
		Auth:          auth.NewHandler(db.DB, cfg, log, verificationService).WithLeads(leadsService).WithAnalytics(analyticsService),
		Reset:         auth.NewResetHandler(cfg, log, resetService),
		OAuth:         auth.NewOAuthHandler(cfg, log, authService, oauthRegistry).WithLeads(leadsService),
		Users:         users.NewHandler(db.DB, profilePhotosS3, cfg, log, nutritionCalcSvc),
		Account:       account.NewHandler(accountService, log),
		Notifications: notifications.NewHandler(cfg, log, db),
		Leads:         leads.NewHandler(leadsService, log),
		Logs:          logs.NewHandler(cfg, log),
		FoodTracker:   foodtracker.NewHandler(cfg, log, db, foodPhotosS3, orClient),
		NutritionCalc: nutritioncalc.NewHandler(cfg, log, db),
		Dashboard:     dashboard.NewHandler(cfg, log, db, s3Client, notificationsSvc, nutritionCalcSvc).WithAnalytics(analyticsService),
		Chat:          chat.NewHandler(cfg, log, db, chatS3, wsHub).WithTickets(authService),
		Curator:       curator.NewHandler(cfg, log, db, notificationsSvc),
		Admin:         admin.NewHandler(cfg, log, db).WithAnalytics(analyticsService),
		AdminJobs:     admin.NewJobsHandler(scheduler),
		Support:       support.NewHandler(cfg, log, supportService),
		Metrics:       metrics,
		Content:       content.NewHandler(cfg, log, contentService),
	})

	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	schedulerDone := make(chan struct{})
	go func() {
		defer close(schedulerDone)
		scheduler.Run(schedulerCtx)
	}()

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

	// Stop scheduling and let any in-flight job finish, so a run cannot be left
	// recorded as "running" forever or interrupted half-written.
	schedulerCancel()
	select {
	case <-schedulerDone:
	case <-time.After(30 * time.Second):
		log.Warn("Timed out waiting for background jobs to finish")
	}

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

// appOrigin turns the configured domain into the origin links in email point
// at. Local development has no domain, and a link to nowhere is worse than a
// link to localhost.
func appOrigin(domain string) string {
	if domain == "" {
		return "http://localhost:3069"
	}
	return "https://" + domain
}
