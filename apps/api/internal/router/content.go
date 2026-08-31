package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerContentRoutes wires three audiences over the same articles:
// anonymous visitors (public feed, drives SEO), authenticated clients (personal
// feed) and authors (management).
func registerContentRoutes(v1 *gin.RouterGroup, d Deps) {
	public := v1.Group("/public/content")
	{
		public.GET("", d.Content.GetPublicFeed)
		public.GET("/:id", d.Content.GetPublicArticle)
	}

	manage := v1.Group("/content/articles")
	manage.Use(middleware.RequireAuth(d.Cfg))
	manage.Use(middleware.RequireRole("coordinator", "super_admin"))
	{
		manage.POST("", d.Content.CreateArticle)
		manage.GET("", d.Content.ListArticles)
		manage.GET("/:id", d.Content.GetArticle)
		manage.PUT("/:id", d.Content.UpdateArticle)
		manage.DELETE("/:id", d.Content.DeleteArticle)
		manage.POST("/:id/publish", d.Content.PublishArticle)
		manage.POST("/:id/schedule", d.Content.ScheduleArticle)
		manage.POST("/:id/unpublish", d.Content.UnpublishArticle)
		manage.POST("/:id/media", d.Content.UploadMedia)
		manage.POST("/upload", d.Content.UploadMarkdownFile)
		manage.POST("/cover", d.Content.UploadCoverImage)
	}

	feed := v1.Group("/content/feed")
	feed.Use(middleware.RequireAuth(d.Cfg))
	{
		feed.GET("", d.Content.GetFeed)
		feed.GET("/:id", d.Content.GetFeedArticle)
	}
}
