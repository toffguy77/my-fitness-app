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

	// Разговор из браузера. Это единственные эндпоинты поддержки, которые
	// посетитель без аккаунта зовёт со своим телом — большинство тратит
	// деньги на модель, а «позвать человека» ниже нет, но токен, за которым
	// они все стоят, посторонний мог бы перебирать одинаково у любого из
	// них, поэтому лимит по адресу общий на все четыре.
	web := v1.Group("/public/support/web")
	web.POST("", d.AuthRateLimiter.Limit("support-web-start"), d.Support.StartWeb)
	web.POST("/message", d.AuthRateLimiter.Limit("support-web-message"), d.Support.WebMessage)
	web.GET("/messages", d.AuthRateLimiter.Limit("support-web-read"), d.Support.WebMessages)
	// «Позвать человека» тратит операторское внимание, а не модель — но всё
	// равно за токеном, который посетитель мог бы перебирать так же, как у
	// остальных трёх маршрутов, поэтому и он под тем же лимитером.
	web.POST("/human", d.AuthRateLimiter.Limit("support-web-human"), d.Support.WebHuman)
	// Контакт из разговора — то же самое, что POST /public/leads: пишет
	// строку в leads. Отдельное имя лимита, а не переиспользование
	// support-web-message, — иначе посетитель, исчерпавший лимит на вопросы,
	// не смог бы уже и оставить контакт.
	web.POST("/contact", d.AuthRateLimiter.Limit("support-web-contact"), d.Support.WebContact)

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
