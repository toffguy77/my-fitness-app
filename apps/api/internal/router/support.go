package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerSupportRoutes wires the Telegram bot and the curator's queue.
// The routes exist whether or not the bot is configured: a disabled capability
// answers 503 here as everywhere else, and the route table stays the same
// across deployments so the contract checks mean something.
func registerSupportRoutes(v1 *gin.RouterGroup, d Deps) {
	// Telegram calls this; it cannot carry a session. The secret header is
	// checked inside the handler, in constant time.
	v1.POST("/public/support/telegram", d.Support.Webhook)

	// Очередь разговоров. Разбирает её куратор: бот снимает простые вопросы,
	// а всё остальное — разговор с человеком, и это работа куратора, а не
	// администратора. Телеграмный вебхук остаётся публичным, как был.
	g := v1.Group("/curator/support")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	g.Use(middleware.RequireRole("coordinator", "super_admin"))

	g.GET("/conversations", d.Support.List)
	g.GET("/conversations/:id", d.Support.Messages)
	g.POST("/conversations/:id/reply", d.Support.Reply)
	g.POST("/conversations/:id/close", d.Support.CloseConversation)
}
