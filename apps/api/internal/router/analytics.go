package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerAnalyticsRoutes wires product event collection.
func registerAnalyticsRoutes(v1 *gin.RouterGroup, d Deps) {
	// Public: most of the funnel happens before anybody has an account. The
	// rate limit is what keeps a public writable endpoint from becoming a
	// place to store arbitrary rows.
	v1.POST("/public/analytics/events",
		d.AuthRateLimiter.Limit("analytics"), d.Analytics.Collect)

	// Joining a browser to the account it produced needs the account.
	v1.POST("/analytics/identify", middleware.RequireAuth(d.Cfg, d.TokenVersions), d.Analytics.Link)
}
