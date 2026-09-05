package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

func registerFoodTrackerRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/food-tracker")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))

	// Diary entries
	g.GET("/entries", d.FoodTracker.GetEntries)
	g.POST("/entries", d.FoodTracker.CreateEntry)
	g.PUT("/entries/:id", d.FoodTracker.UpdateEntry)
	g.DELETE("/entries/:id", d.FoodTracker.DeleteEntry)

	// AI photo recognition (optional capability; declines with 503 when off)
	g.POST("/recognize", d.FoodTracker.RecognizeFood)

	// Food catalogue
	g.GET("/search", d.FoodTracker.SearchFoods)
	g.GET("/barcode/:code", d.FoodTracker.LookupBarcode)
	g.GET("/recent", d.FoodTracker.GetRecentFoods)
	g.GET("/favorites", d.FoodTracker.GetFavoriteFoods)
	g.POST("/favorites/:foodId", d.FoodTracker.AddToFavorites)
	g.DELETE("/favorites/:foodId", d.FoodTracker.RemoveFromFavorites)

	// User-authored foods
	g.POST("/user-foods", d.FoodTracker.CreateUserFood)
	g.POST("/user-foods/clone", d.FoodTracker.CloneUserFood)
	g.GET("/user-foods", d.FoodTracker.GetUserFoods)
	g.PUT("/user-foods/:id", d.FoodTracker.UpdateUserFood)
	g.DELETE("/user-foods/:id", d.FoodTracker.DeleteUserFood)

	// Water intake
	g.GET("/water", d.FoodTracker.GetWaterIntake)
	g.POST("/water", d.FoodTracker.AddWater)

	// Recommendations
	g.GET("/recommendations", d.FoodTracker.GetRecommendations)
	g.GET("/recommendations/:id", d.FoodTracker.GetRecommendationDetail)
	g.PUT("/recommendations/preferences", d.FoodTracker.UpdatePreferences)
	g.POST("/recommendations/custom", d.FoodTracker.CreateCustomRecommendation)
}

func registerNutritionCalcRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/nutrition-calc")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))

	g.GET("/targets", d.NutritionCalc.GetTargets)
	g.GET("/history", d.NutritionCalc.GetHistory)
	g.POST("/recalculate", d.NutritionCalc.Recalculate)
}

func registerDashboardRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/dashboard")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))

	g.GET("/daily/:date", d.Dashboard.GetDailyMetrics)
	g.POST("/daily", d.Dashboard.SaveMetric)
	g.GET("/week", d.Dashboard.GetWeekMetrics)
	g.GET("/progress", d.Dashboard.GetProgress)
	g.GET("/weekly-plan", d.Dashboard.GetWeeklyPlan)
	g.POST("/weekly-plan", d.Dashboard.CreateWeeklyPlan)
	g.GET("/tasks", d.Dashboard.GetTasks)
	g.POST("/tasks", d.Dashboard.CreateTask)
	g.PUT("/tasks/:id", d.Dashboard.UpdateTaskStatus)
	g.POST("/tasks/:id/complete", d.Dashboard.CompleteTaskForDate)
	g.GET("/weekly-reports/:reportId/feedback", d.Dashboard.GetReportFeedback)
	g.POST("/weekly-report", d.Dashboard.SubmitWeeklyReport)
	g.POST("/photo-upload", d.Dashboard.UploadPhoto)
}
