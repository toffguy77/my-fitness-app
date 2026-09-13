package support

import "time"

// IncomingMessage is one message from Telegram, reduced to what matters here.
type IncomingMessage struct {
	ChatID   int64
	Username string
	Name     string
	Text     string
}

// Conversation is a support chat.
type Conversation struct {
	ID       string  `json:"id"`
	ChatID   int64   `json:"chat_id"`
	LeadID   *string `json:"lead_id,omitempty"`
	UserID   *int64  `json:"user_id,omitempty"`
	Status   string  `json:"status"`
	Username string  `json:"telegram_username,omitempty"`
	Name     string  `json:"telegram_name,omitempty"`

	EscalationReason string     `json:"escalation_reason,omitempty"`
	EscalatedAt      *time.Time `json:"escalated_at,omitempty"`
	LastMessageAt    time.Time  `json:"last_message_at"`
	CreatedAt        time.Time  `json:"created_at"`
}

// Message is one line of a support conversation.
type Message struct {
	ID        string    `json:"id"`
	Author    string    `json:"author"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"created_at"`
	// Delivered: Telegram принял сообщение. Без этого поля оператор, открывший
	// переписку, не отличит отправленное от того, что осталось у нас: текст
	// записывается до попытки отправки, чтобы не пропасть при отказе.
	//
	// nil — у входящих, где доставлять некуда, и у сообщений старше миграции
	// 065, про которые исхода не знает никто.
	Delivered *bool `json:"delivered,omitempty"`
}
