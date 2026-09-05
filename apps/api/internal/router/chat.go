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
func registerChatRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/conversations")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))

	g.GET("", d.Chat.GetConversations)
	g.GET("/unread", d.Chat.GetUnreadCount)
	g.GET("/:id/messages", d.Chat.GetMessages)
	g.POST("/:id/messages", d.Chat.SendMessage)
	g.POST("/:id/upload", d.Chat.UploadAttachment)
	g.POST("/:id/read", d.Chat.MarkAsRead)
	g.POST("/:id/messages/:msgId/food-entry", d.Chat.CreateFoodEntry)
}
