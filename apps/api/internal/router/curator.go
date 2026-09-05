package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerCuratorRoutes wires the curator workspace.
//
// Routes addressing a specific client live in a nested group guarded by
// RequireClientRelationship, so access control is a property of the path
// rather than something each handler must remember. This matters because one
// of these routes is implemented in the nutrition-calc module: under the old
// flat registration it silently skipped the check every curator service was
// performing by hand.
func registerCuratorRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/curator")
	g.Use(middleware.RequireAuth(d.Cfg))
	g.Use(middleware.RequireRole("coordinator"))

	// Aggregates over the curator's own clients — no client id in the path.
	g.GET("/analytics", d.Curator.GetAnalytics)
	g.GET("/analytics/history", d.Curator.GetAnalyticsHistory)
	g.GET("/analytics/benchmark", d.Curator.GetBenchmark)
	g.GET("/attention", d.Curator.GetAttentionList)
	g.GET("/clients", d.Curator.GetClients)

	client := g.Group("/clients/:id")
	client.Use(middleware.RequireClientRelationship(d.DB, d.Log))
	{
		client.GET("", d.Curator.GetClientDetail)
		client.PUT("/target-weight", d.Curator.SetTargetWeight)
		client.PUT("/water-goal", d.Curator.SetWaterGoal)

		client.POST("/weekly-plan", d.Curator.CreateWeeklyPlan)
		client.PUT("/weekly-plan/:planId", d.Curator.UpdateWeeklyPlan)
		client.DELETE("/weekly-plan/:planId", d.Curator.DeleteWeeklyPlan)
		client.GET("/weekly-plans", d.Curator.GetWeeklyPlans)

		client.POST("/tasks", d.Curator.CreateTask)
		client.PUT("/tasks/:taskId", d.Curator.UpdateTask)
		client.DELETE("/tasks/:taskId", d.Curator.DeleteTask)
		client.GET("/tasks", d.Curator.GetTasks)
		client.GET("/notices", d.Curator.GetClientNotices)

		client.PUT("/weekly-reports/:reportId/feedback", d.Curator.SubmitFeedback)
		client.GET("/weekly-reports", d.Curator.GetWeeklyReports)

		// Implemented in nutrition-calc; safe because the group guards it.
		client.GET("/targets/history", d.NutritionCalc.GetClientHistory)
	}
}

func registerAdminRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/admin")
	g.Use(middleware.RequireAuth(d.Cfg))
	g.Use(middleware.RequireRole("super_admin"))

	g.GET("/users", d.Admin.GetUsers)
	g.GET("/users/:id", d.Admin.GetUser)
	g.GET("/curators", d.Admin.GetCurators)
	g.POST("/users/:id/role", d.Admin.ChangeRole)
	g.POST("/assignments", d.Admin.AssignCurator)
	g.GET("/conversations", d.Admin.GetConversations)
	g.GET("/conversations/:id/messages", d.Admin.GetConversationMessages)

	// Background job visibility and manual triggering.
	g.GET("/jobs", d.AdminJobs.List)
	g.POST("/jobs/:name/run", d.AdminJobs.Run)
}
