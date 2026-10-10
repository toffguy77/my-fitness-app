package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerMealPlanRoutes wires the client's day plan.
//
// Only a client has a plan: it is assembled for the caller's own target from
// the recipes the caller may see. The owner always comes from the session —
// :date and :mealType name a day and a meal, never somebody's record.
func registerMealPlanRoutes(v1 *gin.RouterGroup, d Deps) {
	client := v1.Group("")
	client.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	client.Use(middleware.RequireRole("client"))
	{
		client.GET("/meal-plans/:date", d.MealPlan.Get)
		client.POST("/meal-plans/:date/regenerate", d.MealPlan.Regenerate)
		client.GET("/meal-plans/:date/items/:mealType/alternatives", d.MealPlan.Alternatives)
		client.PUT("/meal-plans/:date/items/:mealType", d.MealPlan.UpdateItem)
		client.GET("/meal-plan-settings", d.MealPlan.GetSettings)
		client.PUT("/meal-plan-settings", d.MealPlan.SetSettings)
	}
}
