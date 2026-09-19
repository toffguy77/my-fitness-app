package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerSupportRoutes wires the Telegram bot and the operator's queue.
// The routes exist whether or not the bot is configured: a disabled capability
// answers 503 here as everywhere else, and the route table stays the same
// across deployments so the contract checks mean something.
func registerSupportRoutes(v1 *gin.RouterGroup, d Deps) {
	// Telegram calls this; it cannot carry a session. The secret header is
	// checked inside the handler, in constant time.
	v1.POST("/public/support/telegram", d.Support.Webhook)

	// Разговор из браузера. Это единственные эндпоинты поддержки, которые
	// посетитель без аккаунта зовёт со своим телом, и каждый из них тратит
	// деньги на модель — поэтому лимит по адресу на всех трёх.
	web := v1.Group("/public/support/web")
	web.POST("", d.AuthRateLimiter.Limit("support-web-start"), d.Support.StartWeb)
	web.POST("/message", d.AuthRateLimiter.Limit("support-web-message"), d.Support.WebMessage)
	web.GET("/messages", d.AuthRateLimiter.Limit("support-web-read"), d.Support.WebMessages)

	g := v1.Group("/admin/support")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	g.Use(middleware.RequireRole("super_admin"))

	g.GET("/conversations", d.Support.List)
	g.GET("/conversations/:id", d.Support.Messages)
	g.POST("/conversations/:id/reply", d.Support.Reply)
	g.POST("/conversations/:id/close", d.Support.CloseConversation)
}
