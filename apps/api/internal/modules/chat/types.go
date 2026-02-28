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
