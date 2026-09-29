package chat

import (
	"encoding/json"
	"time"
)

// Conversation represents a chat conversation between a client and curator
type Conversation struct {
	ID          string    `json:"id"`
	ClientID    int64     `json:"client_id"`
	CuratorID   int64     `json:"curator_id"`
	LastMessage *Message  `json:"last_message,omitempty"`
	UnreadCount int       `json:"unread_count"`
	Participant *User     `json:"participant"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Access — состояние права клиента на работу с куратором.
//
// Нужно экрану переписки: без права он показывает описание услуги и заявку
// вместо пустого поля ввода. Отключённая кнопка читалась бы как поломка и
// ничего не продавала бы, поэтому вход остаётся живым, а различает состояния
// этот ответ.
type Access struct {
	Allowed bool `json:"allowed"`
	// Expired означает, что куратор был, а право кончилось: тогда предлагается
	// продлить, а не купить, и прежняя переписка остаётся открытой для чтения.
	Expired bool `json:"expired"`
	// ExpiresAt — последний день действия права, YYYY-MM-DD по московскому
	// времени. Пусто у бессрочного права и там, где права нет.
	ExpiresAt string `json:"expires_at,omitempty"`
	// ConversationID прежней переписки, если она есть: без права её всё равно
	// можно читать.
	ConversationID string `json:"conversation_id,omitempty"`
}

// Message represents a single message in a conversation
type Message struct {
	ID             string              `json:"id"`
	ConversationID string              `json:"conversation_id"`
	SenderID       int64               `json:"sender_id"`
	Type           string              `json:"type"`
	Content        *string             `json:"content,omitempty"`
	Metadata       json.RawMessage     `json:"metadata,omitempty"`
	Attachments    []MessageAttachment `json:"attachments,omitempty"`
	CreatedAt      time.Time           `json:"created_at"`
}

// MessageAttachment represents a file attached to a message
type MessageAttachment struct {
	ID       string `json:"id"`
	FileURL  string `json:"file_url"`
	FileName string `json:"file_name"`
	FileSize int64  `json:"file_size"`
	MimeType string `json:"mime_type"`
}

// User represents a chat participant
type User struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url,omitempty"`
}

// SendMessageRequest is the request body for sending a message
type SendMessageRequest struct {
	Type    string  `json:"type" binding:"required,oneof=text image file"`
	Content *string `json:"content"`
}

// CreateFoodEntryRequest is the request body for creating a food entry from chat
type CreateFoodEntryRequest struct {
	FoodName string  `json:"food_name" binding:"required"`
	MealType string  `json:"meal_type" binding:"required,oneof=breakfast lunch dinner snack"`
	Weight   float64 `json:"weight" binding:"required,gt=0"`
	Calories float64 `json:"calories" binding:"required,gte=0"`
	Protein  float64 `json:"protein" binding:"required,gte=0"`
	Fat      float64 `json:"fat" binding:"required,gte=0"`
	Carbs    float64 `json:"carbs" binding:"required,gte=0"`
}
