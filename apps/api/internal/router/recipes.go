package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerRecipeRoutes wires the recipe catalogue for its three audiences.
//
// The team (super_admin) writes recipes; only the curator (coordinator)
// approves them. RequireRole matches exactly, so super_admin is refused
// approval without any code of ours — a review anyone could pass would be a
// formality. Clients see only what internal/shared/recipeaccess allows.
//
// Routes about a particular client are not here: they live in the
// /curator/clients/:id group (registerCuratorClientRecipeRoutes), so
// RequireClientRelationship covers them.
func registerRecipeRoutes(v1 *gin.RouterGroup, d Deps) {
	team := v1.Group("/admin/recipes")
	team.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	team.Use(middleware.RequireRole("super_admin"))
	{
		team.GET("", d.Recipes.AdminList)
		team.POST("", d.Recipes.AdminCreate)
		team.POST("/photos", d.Recipes.AdminUploadPhoto)
		team.GET("/catalogue-search", d.Recipes.AdminCatalogueSearch)
		team.GET("/import/vkusvill", d.Recipes.AdminVkusvillSearch)
		team.POST("/import/vkusvill/:sourceRef", d.Recipes.AdminVkusvillImport)
		team.GET("/:id", d.Recipes.Detail)
		team.PUT("/:id/draft", d.Recipes.AdminSaveDraft)
		team.POST("/:id/submit", d.Recipes.AdminSubmit)
		team.POST("/:id/unpublish", d.Recipes.AdminUnpublish)
		team.POST("/:id/publish", d.Recipes.AdminPublish)
	}

	review := v1.Group("/curator/recipes")
	review.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	review.Use(middleware.RequireRole("coordinator"))
	{
		review.GET("", d.Recipes.CuratorList)
		review.GET("/review", d.Recipes.CuratorReviewQueue)
		review.GET("/:id", d.Recipes.Detail)
		review.POST("/:id/approve", d.Recipes.CuratorApprove)
		review.POST("/:id/return", d.Recipes.CuratorReturn)
	}

	// Свои данные: каталог фильтруется правилом доступности для вызывающего,
	// отклонения и ограничения — только его. Роль не проверяется: команда и
	// куратор видят то же, что увидели бы клиентом.
	client := v1.Group("")
	client.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	{
		client.GET("/recipes", d.Recipes.List)
		client.GET("/recipes/:id", d.Recipes.Get)
		client.POST("/recipes/:id/reject", d.Recipes.Reject)
		client.DELETE("/recipes/:id/reject", d.Recipes.Unreject)
		client.GET("/food-restrictions", d.Recipes.MyRestrictions)
		client.PUT("/food-restrictions", d.Recipes.SetMyRestrictions)
	}
}

// registerCuratorClientRecipeRoutes adds the recipe routes about one client to
// the curator's /curator/clients/:id group, under RequireClientRelationship.
func registerCuratorClientRecipeRoutes(client *gin.RouterGroup, d Deps) {
	client.GET("/food-restrictions", d.Recipes.CuratorClientRestrictions)
	client.PUT("/food-restrictions", d.Recipes.CuratorSetClientRestrictions)
	client.GET("/hidden-recipes", d.Recipes.CuratorHiddenRecipes)
	client.PUT("/hidden-recipes/:recipeId", d.Recipes.CuratorHide)
	client.DELETE("/hidden-recipes/:recipeId", d.Recipes.CuratorUnhide)
}
