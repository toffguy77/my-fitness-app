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
	// No id in the path: the signed resume token names the lead, so a stranger
	// cannot address somebody else's. Hence no entry in protectedRoutes.
	g.POST("/leads/client-id", d.Leads.AttachClientID)
	g.GET("/leads/resume", d.Leads.Resume)
	g.GET("/leads/unsubscribe", d.Leads.Unsubscribe)
}

// registerCuratorLeadRoutes wires the lead queue.
//
// Deliberately NOT inside /curator/clients/:id: that group is guarded by
// RequireClientRelationship, and a lead has no client by definition — it
// exists precisely until the person becomes one. The protection here is the
// role, as it was under /admin, and only the list of roles widens.
func registerCuratorLeadRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/curator/leads")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	g.Use(middleware.RequireRole("coordinator", "super_admin"))

	g.GET("", d.Leads.List)
	g.POST("/:id/handled", d.Leads.MarkHandled)
}
