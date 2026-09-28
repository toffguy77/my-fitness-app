package router

import (
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

// registerChatRoutes wires the curator-client conversation.
//
// Access is per-conversation rather than per-role — both participants use the
// same endpoints — so each handler validates membership itself via
// ValidateParticipant. That is recorded in the authorization matrix.
//
// Запись в переписку требует ещё и действующего права клиента на работу с
// куратором: оно закрыто middleware на подгруппе, а не проверкой в
// обработчиках, чтобы новый маршрут записи, добавленный сюда, был защищён сам
// собой. Чтение и отметка о прочтении остаются открытыми — написанное
// человеком не становится недоступным ему из-за окончания оплаты.
func registerChatRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/conversations")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))

	g.GET("", d.Chat.GetConversations)
	g.GET("/unread", d.Chat.GetUnreadCount)
	g.GET("/access", d.Chat.GetAccess)
	g.GET("/:id/messages", d.Chat.GetMessages)
	g.POST("/:id/read", d.Chat.MarkAsRead)

	w := g.Group("/:id", middleware.RequireCuratorAccess(d.DB, d.Log))
	w.POST("/messages", d.Chat.SendMessage)
	w.POST("/upload", d.Chat.UploadAttachment)
	w.POST("/messages/:msgId/food-entry", d.Chat.CreateFoodEntry)
}
