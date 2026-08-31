package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

func registerUserRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/users")
	g.Use(middleware.RequireAuth(d.Cfg))

	g.GET("/profile", d.Users.GetProfile)
	g.PUT("/profile", d.Users.UpdateProfile)
	g.PUT("/settings", d.Users.UpdateSettings)
	g.POST("/avatar", d.Users.UploadAvatar)
	g.DELETE("/avatar", d.Users.DeleteAvatar)
	g.PUT("/onboarding/complete", d.Users.CompleteOnboarding)

	// Account lifecycle the user controls: deletion with a cancellation window,
	// and taking their own data with them.
	g.POST("/me/deletion", d.Account.RequestDeletion)
	g.DELETE("/me/deletion", d.Account.CancelDeletion)
	g.GET("/me/deletion", d.Account.GetDeletionStatus)
	g.POST("/me/export", d.Account.RequestExport)
	g.GET("/me/export", d.Account.ListExports)
	g.GET("/me/export/:id", d.Account.DownloadExport)
}

func registerNotificationRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/notifications")
	g.Use(middleware.RequireAuth(d.Cfg))

	g.GET("", d.Notifications.GetNotifications)
	g.POST("/:id/read", d.Notifications.MarkAsRead)
	g.GET("/unread-counts", d.Notifications.GetUnreadCounts)
	g.POST("/mark-all-read", d.Notifications.MarkAllAsRead)
	g.GET("/preferences", d.Notifications.GetPreferences)
	g.PUT("/preferences", d.Notifications.UpdatePreferences)
}

// registerLogRoutes exposes client log ingestion. Submission is public because
// the frontend must be able to report errors that happen before or during
// authentication; reading aggregates is restricted.
func registerLogRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/logs")

	g.POST("", d.AuthRateLimiter.Limit("client-logs"), d.Logs.ReceiveLogs)
	g.GET("/stats", middleware.RequireAuth(d.Cfg), middleware.RequireRole("super_admin"), d.Logs.GetLogStats)
}
