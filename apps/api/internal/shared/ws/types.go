package ws

import "encoding/json"

// Event types sent over WebSocket
const (
	EventNewMessage          = "new_message"
	EventTyping              = "typing"
	EventUnreadCountUpdate   = "unread_count_update"
	EventContentNotification = "content_notification"
)

// OutgoingEvent is sent from server to client
type OutgoingEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// IncomingEvent is received from client
type IncomingEvent struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// TypingData for typing indicator events
type TypingData struct {
	ConversationID string `json:"conversation_id"`
	UserID         int64  `json:"user_id"`
}
