package admin

import "time"

// AdminUser represents a user as seen in the admin panel
type AdminUser struct {
	ID          int64   `json:"id"`
	Email       string  `json:"email"`
	Name        string  `json:"name"`
	Role        string  `json:"role"`
	AvatarURL   string  `json:"avatar_url,omitempty"`
	CuratorName *string `json:"curator_name,omitempty"`
	CuratorID   *int64  `json:"curator_id,omitempty"`
	// CuratorAccessExpiresAt — последний день действия права, YYYY-MM-DD. Пусто
	// означает бессрочно; администратор обязан видеть разницу, потому что
	// бессрочное право у живого клиента — признак ошибки выдачи.
	CuratorAccessExpiresAt string     `json:"curator_access_expires_at,omitempty"`
	ClientCount            int        `json:"client_count"`
	CreatedAt              time.Time  `json:"created_at"`
	LastLoginAt            *time.Time `json:"last_login_at,omitempty"`
}

// CuratorLoad represents a curator with their client load
type CuratorLoad struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	ClientCount int    `json:"client_count"`
}

// AdminConversation represents a conversation as seen by admin
type AdminConversation struct {
	ID           string    `json:"id"`
	ClientID     int64     `json:"client_id"`
	ClientName   string    `json:"client_name"`
	CuratorID    int64     `json:"curator_id"`
	CuratorName  string    `json:"curator_name"`
	MessageCount int       `json:"message_count"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// AdminMessage represents a message as seen by admin (read-only)
type AdminMessage struct {
	ID         string    `json:"id"`
	SenderID   int64     `json:"sender_id"`
	SenderName string    `json:"sender_name"`
	Type       string    `json:"type"`
	Content    *string   `json:"content,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// ChangeRoleRequest is the request body for changing a user's role
type ChangeRoleRequest struct {
	Role string `json:"role" binding:"required,oneof=coordinator client"`
}

// AssignCuratorRequest is the request body for assigning a curator to a client
//
// AccessExpiresAt — последний день действия права, YYYY-MM-DD. Для живого
// клиента он обязателен: бессрочное право у живого человека неотличимо от
// ошибки выдачи. Пусто допустимо только для служебных учётных записей прогона,
// и решает это служба, а не форма.
type AssignCuratorRequest struct {
	ClientID        int64  `json:"client_id" binding:"required"`
	CuratorID       int64  `json:"curator_id" binding:"required"`
	AccessExpiresAt string `json:"access_expires_at"`
}

// SetAccessExpiryRequest — продление права: меняется только дата.
//
// Куратор и переписка при продлении сохраняются: новая связь на каждую оплату
// рвала бы историю работы.
type SetAccessExpiryRequest struct {
	AccessExpiresAt string `json:"access_expires_at" binding:"required"`
}
