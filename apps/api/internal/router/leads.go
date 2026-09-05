package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerLeadRoutes wires the guest onboarding.
//
// These are the only endpoints in the service a visitor with no account reaches
// with a body of their own, so every one of them is rate limited by address.
func registerLeadRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/public")

	// The calculation stores nothing; the limit exists because it is arithmetic
	// anybody can ask for as fast as they like.
	g.POST("/nutrition/calculate",
		d.AuthRateLimiter.Limit("guest-calculate"), d.NutritionCalc.CalculateForGuest)

	g.POST("/leads", d.AuthRateLimiter.Limit("lead-create"), d.Leads.Create)
	g.POST("/leads/step", d.Leads.UpdateStep)
	g.GET("/leads/resume", d.Leads.Resume)
	g.GET("/leads/unsubscribe", d.Leads.Unsubscribe)
}

// registerAdminLeadRoutes wires the administrative view of leads.
func registerAdminLeadRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/admin/leads")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	g.Use(middleware.RequireRole("super_admin"))

	g.GET("", d.Leads.List)
	g.POST("/:id/handled", d.Leads.MarkHandled)
}
