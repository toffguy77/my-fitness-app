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
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/logs"
	"github.com/burcev/api/internal/modules/nutrition"
	"github.com/burcev/api/internal/modules/users"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize logger
	log := logger.New()
	defer log.Sync()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("Failed to load configuration", "error", err)
	}

	// Set Gin mode
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router
	router := gin.New()

	// Global middleware
	router.Use(gin.Recovery())
	router.Use(middleware.Logger(log))
	router.Use(middleware.ErrorHandler(log))

	// CORS configuration
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CORSOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":      "ok",
			"timestamp":   time.Now().Format(time.RFC3339),
			"environment": cfg.Env,
		})
	})

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Auth routes
		authHandler := auth.NewHandler(cfg, log)
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/register", authHandler.Register)
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/logout", authHandler.Logout)
			authGroup.GET("/me", middleware.RequireAuth(cfg), authHandler.GetCurrentUser)
		}

		// Users routes (protected)
		usersHandler := users.NewHandler(cfg, log)
		usersGroup := v1.Group("/users")
		usersGroup.Use(middleware.RequireAuth(cfg))
		{
			usersGroup.GET("/profile", usersHandler.GetProfile)
			usersGroup.PUT("/profile", usersHandler.UpdateProfile)
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

		// Logs routes (public for frontend logging)
		logsHandler := logs.NewHandler(cfg, log)
		logsGroup := v1.Group("/logs")
		{
			logsGroup.POST("", logsHandler.ReceiveLogs)
			// Protected stats endpoint
			logsGroup.GET("/stats", middleware.RequireAuth(cfg), middleware.RequireRole("admin"), logsHandler.GetLogStats)
		}
	}

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
