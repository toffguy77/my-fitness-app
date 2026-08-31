// Package router owns HTTP route registration.
//
// Routes used to be declared inline in cmd/server/main.go, in one flat list of
// ~100 entries. That shape hid two real defects: a route whose handler lived in
// another module never got its authorization check, and an implemented handler
// was never registered at all. Splitting registration per domain keeps a
// reviewer's diff inside one small file, and gives the authorization matrix
// test a built engine to walk.
package router

import (
	"net/http"
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
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Deps carries everything the routes need. main.go builds it; the router only
// wires paths to handlers, so route registration stays testable without a
// database, S3 or SMTP.
type Deps struct {
	Cfg *config.Config
	Log *logger.Logger
	DB  *database.DB

	AuthRateLimiter *middleware.AuthRateLimiter

	Auth          *auth.Handler
	Reset         *auth.ResetHandler
	Users         *users.Handler
	Nutrition     *nutrition.Handler
	Notifications *notifications.Handler
	Logs          *logs.Handler
	FoodTracker   *foodtracker.Handler
	NutritionCalc *nutritioncalc.Handler
	Dashboard     *dashboard.Handler
	Chat          *chat.Handler
	Curator       *curator.Handler
	Admin         *admin.Handler
	Content       *content.Handler
}

// New builds the engine with global middleware and every route registered.
func New(d Deps) *gin.Engine {
	engine := gin.New()

	// Trust only RFC1918 private addresses so that nginx (docker internal IP)
	// can set X-Forwarded-For, but external clients cannot spoof it.
	_ = engine.SetTrustedProxies([]string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"})

	engine.Use(gin.Recovery())
	engine.Use(middleware.NoCacheAPI())
	engine.Use(middleware.Logger(d.Log))
	engine.Use(middleware.ErrorHandler(d.Log))

	// API is behind the Next.js proxy — not exposed directly to the internet.
	// Allow all origins so forwarded Origin headers from the proxy pass through.
	engine.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	registerHealth(engine, d)

	v1 := engine.Group("/api/v1")
	registerAuthRoutes(v1, d)
	registerUserRoutes(v1, d)
	registerNutritionRoutes(v1, d)
	registerNotificationRoutes(v1, d)
	registerLogRoutes(v1, d)
	registerFoodTrackerRoutes(v1, d)
	registerNutritionCalcRoutes(v1, d)
	registerDashboardRoutes(v1, d)
	registerChatRoutes(v1, d)
	registerCuratorRoutes(v1, d)
	registerAdminRoutes(v1, d)
	registerContentRoutes(v1, d)

	// WebSocket upgrade. Authentication happens inside the handler because
	// browsers cannot set headers on a WebSocket handshake.
	engine.GET("/ws", d.Chat.HandleWebSocket)

	return engine
}

func registerHealth(engine *gin.Engine, d Deps) {
	engine.GET("/health", func(c *gin.Context) {
		dbStatus := "ok"
		if err := d.DB.Health(c.Request.Context()); err != nil {
			dbStatus = "unhealthy"
			d.Log.Error("Database health check failed", "error", err)
		}

		c.JSON(http.StatusOK, gin.H{
			"status":      "ok",
			"timestamp":   time.Now().Format(time.RFC3339),
			"environment": d.Cfg.Env,
			"database":    dbStatus,
			"features":    d.Cfg.Features.Map(),
		})
	})
}
