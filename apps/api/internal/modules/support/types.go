package support

import "time"

// IncomingMessage is one message from Telegram, reduced to what matters here —
// or one message from the web widget, which already knows its conversation.
type IncomingMessage struct {
	ChatID   int64
	Username string
	Name     string
	Text     string

	// Conversation, when set, names a conversation that already exists — the
	// web channel's entry point, resolved earlier from the visitor's token, so
	// HandleMessage does not look it up again by an id nobody supplied. Nil
	// for Telegram, whose conversation is found (or opened) by chat id below.
	Conversation *Conversation
}

// Каналы разговора. Их два, и это исчерпывающий список.
const (
	ChannelTelegram = "telegram"
	ChannelWeb      = "web"
)

// Conversation is a support chat.
type Conversation struct {
	ID       string  `json:"id"`
	Channel  string  `json:"channel"`
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
