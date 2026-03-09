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
	"github.com/burcev/api/internal/modules/nutrition"
	nutritioncalc "github.com/burcev/api/internal/modules/nutrition-calc"
	"github.com/burcev/api/internal/modules/users"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/burcev/api/internal/shared/ws"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize logger
	log := logger.New()
	defer func() { _ = log.Sync() }()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("Failed to load configuration", "error", err)
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

	// Initialize weekly photos S3 client (optional, for photo uploads)
	var s3Client *storage.S3Client
	if cfg.WeeklyPhotosS3AccessKeyID != "" && cfg.WeeklyPhotosS3SecretAccessKey != "" {
		s3Client, err = storage.NewS3Client(&storage.S3Config{
			AccessKeyID:     cfg.WeeklyPhotosS3AccessKeyID,
			SecretAccessKey: cfg.WeeklyPhotosS3SecretAccessKey,
			Bucket:          cfg.WeeklyPhotosS3Bucket,
			Region:          cfg.WeeklyPhotosS3Region,
			Endpoint:        cfg.WeeklyPhotosS3Endpoint,
			PathPrefix:      cfg.S3PathPrefix,
		}, log)
		if err != nil {
			log.Error("Failed to initialize weekly photos S3 client", "error", err)
		} else {
			log.Info("Weekly photos S3 client initialized", "bucket", cfg.WeeklyPhotosS3Bucket)
		}
	}

	// Initialize profile photos S3 client
	var profilePhotosS3 *storage.S3Client
	if cfg.ProfilePhotosS3AccessKeyID != "" && cfg.ProfilePhotosS3SecretAccessKey != "" {
		profilePhotosS3, err = storage.NewS3Client(&storage.S3Config{
			AccessKeyID:     cfg.ProfilePhotosS3AccessKeyID,
			SecretAccessKey: cfg.ProfilePhotosS3SecretAccessKey,
			Bucket:          cfg.ProfilePhotosS3Bucket,
			Region:          cfg.ProfilePhotosS3Region,
			Endpoint:        cfg.ProfilePhotosS3Endpoint,
			PathPrefix:      cfg.S3PathPrefix,
		}, log)
		if err != nil {
			log.Error("Failed to initialize profile photos S3 client", "error", err)
		} else {
			log.Info("Profile photos S3 client initialized", "bucket", cfg.ProfilePhotosS3Bucket)
		}
	}

	// Initialize chat S3 client
	var chatS3 *storage.S3Client
	if cfg.ChatS3AccessKeyID != "" && cfg.ChatS3SecretAccessKey != "" {
		chatS3, err = storage.NewS3Client(&storage.S3Config{
			AccessKeyID:     cfg.ChatS3AccessKeyID,
			SecretAccessKey: cfg.ChatS3SecretAccessKey,
			Bucket:          cfg.ChatS3Bucket,
			Region:          cfg.ChatS3Region,
			Endpoint:        cfg.ChatS3Endpoint,
			PathPrefix:      cfg.S3PathPrefix,
		}, log)
		if err != nil {
			log.Error("Failed to initialize chat S3 client", "error", err)
		} else {
			log.Info("Chat S3 client initialized", "bucket", cfg.ChatS3Bucket)
		}
	}

	// Initialize content S3 client
	var contentS3 *storage.S3Client
	if cfg.ContentS3AccessKeyID != "" && cfg.ContentS3SecretAccessKey != "" {
		contentS3, err = storage.NewS3Client(&storage.S3Config{
			AccessKeyID:     cfg.ContentS3AccessKeyID,
			SecretAccessKey: cfg.ContentS3SecretAccessKey,
			Bucket:          cfg.ContentS3Bucket,
			Region:          cfg.ContentS3Region,
			Endpoint:        cfg.ContentS3Endpoint,
			PathPrefix:      cfg.S3PathPrefix,
		}, log)
		if err != nil {
			log.Error("Failed to initialize content S3 client", "error", err)
		} else {
			log.Info("Content S3 client initialized", "bucket", cfg.ContentS3Bucket)
		}
	}

	// Initialize rate limiter
	rateLimiter := middleware.NewRateLimiter(db.DB, log)

	// Initialize reset service
	resetService := auth.NewResetService(db.DB, cfg, log, emailService, rateLimiter)

	// Set Gin mode
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router
	router := gin.New()

	// Global middleware
	router.Use(gin.Recovery())
	router.Use(middleware.NoCacheAPI())
	router.Use(middleware.Logger(log))
	router.Use(middleware.ErrorHandler(log))

	// CORS configuration
	// API is behind Next.js proxy — not exposed directly to the internet.
	// Allow all origins so forwarded Origin headers from the proxy don't get blocked.
	router.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		// Check database health
		dbStatus := "ok"
		if err := db.Health(c.Request.Context()); err != nil {
			dbStatus = "unhealthy"
			log.Error("Database health check failed", "error", err)
		}

		c.JSON(http.StatusOK, gin.H{
			"status":      "ok",
			"timestamp":   time.Now().Format(time.RFC3339),
			"environment": cfg.Env,
			"database":    dbStatus,
		})
	})

	// WebSocket hub (shared between chat handler for REST and WS)
	wsHub := ws.NewHub()

	// Chat handler (used for both REST routes and WebSocket)
	chatHandler := chat.NewHandler(cfg, log, db, chatS3, wsHub)

	// Ensure conversations exist for all active curator-client relationships
	chatService := chat.NewService(db, log)
	if err := chatService.EnsureConversationsExist(context.Background()); err != nil {
		log.Error("Failed to ensure conversations exist", "error", err)
	}

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Auth routes
		verificationService := auth.NewVerificationService(db.DB, log, emailService)
		authHandler := auth.NewHandler(db.DB, cfg, log, verificationService)
		resetHandler := auth.NewResetHandler(cfg, log, resetService)
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/register", authHandler.Register)
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/refresh", authHandler.Refresh)
			authGroup.POST("/logout", authHandler.Logout)
			authGroup.GET("/me", middleware.RequireAuth(cfg), authHandler.GetCurrentUser)
			authGroup.POST("/verify-email", middleware.RequireAuth(cfg), authHandler.VerifyEmail)
			authGroup.POST("/resend-verification", middleware.RequireAuth(cfg), authHandler.ResendVerification)

			// Password reset routes
			authGroup.POST("/forgot-password", resetHandler.ForgotPassword)
			authGroup.POST("/reset-password", resetHandler.ResetPassword)
			authGroup.GET("/validate-reset-token", resetHandler.ValidateResetToken)
		}

		// Shared nutrition-calc service (used by multiple handlers for KBJU recalculation)
		nutritionCalcSvc := nutritioncalc.NewService(db, log)

		// Users routes (protected)
		usersHandler := users.NewHandler(db.DB, profilePhotosS3, cfg, log, nutritionCalcSvc)
		usersGroup := v1.Group("/users")
		usersGroup.Use(middleware.RequireAuth(cfg))
		{
			usersGroup.GET("/profile", usersHandler.GetProfile)
			usersGroup.PUT("/profile", usersHandler.UpdateProfile)
			usersGroup.PUT("/settings", usersHandler.UpdateSettings)
			usersGroup.POST("/avatar", usersHandler.UploadAvatar)
			usersGroup.DELETE("/avatar", usersHandler.DeleteAvatar)
			usersGroup.PUT("/onboarding/complete", usersHandler.CompleteOnboarding)
		}

		// Nutrition routes (protected)
		nutritionHandler := nutrition.NewHandler(cfg, log)
		nutritionGroup := v1.Group("/nutrition")
		nutritionGroup.Use(middleware.RequireAuth(cfg))
		{
			nutritionGroup.GET("/entries", nutritionHandler.GetEntries)
			nutritionGroup.POST("/entries", nutritionHandler.CreateEntry)
			nutritionGroup.GET("/entries/:id", nutritionHandler.GetEntry)
			nutritionGroup.PUT("/entries/:id", nutritionHandler.UpdateEntry)
			nutritionGroup.DELETE("/entries/:id", nutritionHandler.DeleteEntry)
		}

		// Notifications routes (protected)
		notificationsHandler := notifications.NewHandler(cfg, log, db)
		notificationsGroup := v1.Group("/notifications")
		notificationsGroup.Use(middleware.RequireAuth(cfg))
		{
			notificationsGroup.GET("", notificationsHandler.GetNotifications)
			notificationsGroup.POST("/:id/read", notificationsHandler.MarkAsRead)
			notificationsGroup.GET("/unread-counts", notificationsHandler.GetUnreadCounts)
			notificationsGroup.POST("/mark-all-read", notificationsHandler.MarkAllAsRead)
			notificationsGroup.GET("/preferences", notificationsHandler.GetPreferences)
			notificationsGroup.PUT("/preferences", notificationsHandler.UpdatePreferences)
		}

		// Logs routes (public for frontend logging)
		logsHandler := logs.NewHandler(cfg, log)
		logsGroup := v1.Group("/logs")
		{
			logsGroup.POST("", logsHandler.ReceiveLogs)
			// Protected stats endpoint
			logsGroup.GET("/stats", middleware.RequireAuth(cfg), middleware.RequireRole("super_admin"), logsHandler.GetLogStats)
		}

		// Food tracker routes (protected)
		foodTrackerHandler := foodtracker.NewHandler(cfg, log, db)
		ftGroup := v1.Group("/food-tracker")
		ftGroup.Use(middleware.RequireAuth(cfg))
		{
			// Food entries
			ftGroup.GET("/entries", foodTrackerHandler.GetEntries)
			ftGroup.POST("/entries", foodTrackerHandler.CreateEntry)
			ftGroup.PUT("/entries/:id", foodTrackerHandler.UpdateEntry)
			ftGroup.DELETE("/entries/:id", foodTrackerHandler.DeleteEntry)

			// Food search
			ftGroup.GET("/search", foodTrackerHandler.SearchFoods)
			ftGroup.GET("/barcode/:code", foodTrackerHandler.LookupBarcode)
			ftGroup.GET("/recent", foodTrackerHandler.GetRecentFoods)
			ftGroup.GET("/favorites", foodTrackerHandler.GetFavoriteFoods)
			ftGroup.POST("/favorites/:foodId", foodTrackerHandler.AddToFavorites)
			ftGroup.DELETE("/favorites/:foodId", foodTrackerHandler.RemoveFromFavorites)

			// User foods
			ftGroup.POST("/user-foods", foodTrackerHandler.CreateUserFood)
			ftGroup.POST("/user-foods/clone", foodTrackerHandler.CloneUserFood)
			ftGroup.GET("/user-foods", foodTrackerHandler.GetUserFoods)
			ftGroup.PUT("/user-foods/:id", foodTrackerHandler.UpdateUserFood)
			ftGroup.DELETE("/user-foods/:id", foodTrackerHandler.DeleteUserFood)

			// Water tracking
			ftGroup.GET("/water", foodTrackerHandler.GetWaterIntake)
			ftGroup.POST("/water", foodTrackerHandler.AddWater)

			// Recommendations
			ftGroup.GET("/recommendations", foodTrackerHandler.GetRecommendations)
			ftGroup.GET("/recommendations/:id", foodTrackerHandler.GetRecommendationDetail)
			ftGroup.PUT("/recommendations/preferences", foodTrackerHandler.UpdatePreferences)
			ftGroup.POST("/recommendations/custom", foodTrackerHandler.CreateCustomRecommendation)
		}

		// Nutrition calculator routes (protected)
		nutritionCalcHandler := nutritioncalc.NewHandler(cfg, log, db)
		ncGroup := v1.Group("/nutrition-calc")
		ncGroup.Use(middleware.RequireAuth(cfg))
		{
			ncGroup.GET("/targets", nutritionCalcHandler.GetTargets)
			ncGroup.GET("/history", nutritionCalcHandler.GetHistory)
			ncGroup.POST("/recalculate", nutritionCalcHandler.Recalculate)
		}

		// Dashboard routes (protected)
		notificationsSvc := notifications.NewService(db, log)
		dashboardHandler := dashboard.NewHandler(cfg, log, db, s3Client, notificationsSvc, nutritionCalcSvc)
		dashGroup := v1.Group("/dashboard")
		dashGroup.Use(middleware.RequireAuth(cfg))
		{
			dashGroup.GET("/daily/:date", dashboardHandler.GetDailyMetrics)
			dashGroup.POST("/daily", dashboardHandler.SaveMetric)
			dashGroup.GET("/week", dashboardHandler.GetWeekMetrics)
			dashGroup.GET("/progress", dashboardHandler.GetProgress)
			dashGroup.GET("/weekly-plan", dashboardHandler.GetWeeklyPlan)
			dashGroup.POST("/weekly-plan", dashboardHandler.CreateWeeklyPlan)
			dashGroup.GET("/tasks", dashboardHandler.GetTasks)
			dashGroup.POST("/tasks", dashboardHandler.CreateTask)
			dashGroup.PUT("/tasks/:id", dashboardHandler.UpdateTaskStatus)
			dashGroup.POST("/weekly-report", dashboardHandler.SubmitWeeklyReport)
			dashGroup.POST("/photo-upload", dashboardHandler.UploadPhoto)
		}

		// Chat routes (protected, both roles)
		convGroup := v1.Group("/conversations")
		convGroup.Use(middleware.RequireAuth(cfg))
		{
			convGroup.GET("", chatHandler.GetConversations)
			convGroup.GET("/unread", chatHandler.GetUnreadCount)
			convGroup.GET("/:id/messages", chatHandler.GetMessages)
			convGroup.POST("/:id/messages", chatHandler.SendMessage)
			convGroup.POST("/:id/upload", chatHandler.UploadAttachment)
			convGroup.POST("/:id/read", chatHandler.MarkAsRead)
			convGroup.POST("/:id/messages/:msgId/food-entry", chatHandler.CreateFoodEntry)
		}

		// Curator routes (coordinator role only)
		curatorHandler := curator.NewHandler(cfg, log, db)
		curatorGroup := v1.Group("/curator")
		curatorGroup.Use(middleware.RequireAuth(cfg))
		curatorGroup.Use(middleware.RequireRole("coordinator"))
		{
			curatorGroup.GET("/clients", curatorHandler.GetClients)
			curatorGroup.GET("/clients/:id", curatorHandler.GetClientDetail)
			curatorGroup.PUT("/clients/:id/target-weight", curatorHandler.SetTargetWeight)
			curatorGroup.PUT("/clients/:id/water-goal", curatorHandler.SetWaterGoal)
			curatorGroup.GET("/clients/:id/targets/history", nutritionCalcHandler.GetClientHistory)
		}

		// Admin routes (super_admin role only)
		adminHandler := admin.NewHandler(cfg, log, db)
		adminGroup := v1.Group("/admin")
		adminGroup.Use(middleware.RequireAuth(cfg))
		adminGroup.Use(middleware.RequireRole("super_admin"))
		{
			adminGroup.GET("/users", adminHandler.GetUsers)
			adminGroup.GET("/curators", adminHandler.GetCurators)
			adminGroup.POST("/users/:id/role", adminHandler.ChangeRole)
			adminGroup.POST("/assignments", adminHandler.AssignCurator)
			adminGroup.GET("/conversations", adminHandler.GetConversations)
			adminGroup.GET("/conversations/:id/messages", adminHandler.GetConversationMessages)
		}
	}

	// Content management routes (coordinator + super_admin)
	var contentS3Uploader content.S3Uploader
	if contentS3 != nil {
		contentS3Uploader = contentS3
	}
	contentService := content.NewService(db, log, contentS3Uploader, wsHub)
	contentHandler := content.NewHandler(cfg, log, contentService)

	// Public content routes (no auth required)
	publicContentGroup := v1.Group("/public/content")
	{
		publicContentGroup.GET("", contentHandler.GetPublicFeed)
		publicContentGroup.GET("/:id", contentHandler.GetPublicArticle)
	}

	contentManageGroup := v1.Group("/content/articles")
	contentManageGroup.Use(middleware.RequireAuth(cfg))
	contentManageGroup.Use(middleware.RequireRole("coordinator", "super_admin"))
	{
		contentManageGroup.POST("", contentHandler.CreateArticle)
		contentManageGroup.GET("", contentHandler.ListArticles)
		contentManageGroup.GET("/:id", contentHandler.GetArticle)
		contentManageGroup.PUT("/:id", contentHandler.UpdateArticle)
		contentManageGroup.DELETE("/:id", contentHandler.DeleteArticle)
		contentManageGroup.POST("/:id/publish", contentHandler.PublishArticle)
		contentManageGroup.POST("/:id/schedule", contentHandler.ScheduleArticle)
		contentManageGroup.POST("/:id/unpublish", contentHandler.UnpublishArticle)
		contentManageGroup.POST("/:id/media", contentHandler.UploadMedia)
		contentManageGroup.POST("/upload", contentHandler.UploadMarkdownFile)
	}

	// Client content feed
	contentFeedGroup := v1.Group("/content/feed")
	contentFeedGroup.Use(middleware.RequireAuth(cfg))
	{
		contentFeedGroup.GET("", contentHandler.GetFeed)
		contentFeedGroup.GET("/:id", contentHandler.GetFeedArticle)
	}

	// WebSocket endpoint (JWT checked in handler via query param)
	router.GET("/ws", chatHandler.HandleWebSocket)

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
