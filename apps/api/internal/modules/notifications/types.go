package notifications

import (
	"fmt"
	"time"
)

// NotificationCategory represents the category of a notification
type NotificationCategory string

const (
	CategoryMain    NotificationCategory = "main"
	CategoryContent NotificationCategory = "content"
)

// IsValid checks if the notification category is valid
func (c NotificationCategory) IsValid() bool {
	switch c {
	case CategoryMain, CategoryContent:
		return true
	}
	return false
}

// NotificationType represents the type of a notification
type NotificationType string

const (
	TypeTrainerFeedback NotificationType = "trainer_feedback"
	TypeAchievement     NotificationType = "achievement"
	TypeReminder        NotificationType = "reminder"
	TypeSystemUpdate    NotificationType = "system_update"
	TypeNewFeature      NotificationType = "new_feature"
	TypeGeneral         NotificationType = "general"
)

// IsValid checks if the notification type is valid
func (t NotificationType) IsValid() bool {
	switch t {
	case TypeTrainerFeedback, TypeAchievement, TypeReminder, TypeSystemUpdate, TypeNewFeature, TypeGeneral:
		return true
	}
	return false
}

// Notification represents a user notification
type Notification struct {
	ID        string               `json:"id" db:"id"`
	UserID    int64                `json:"user_id" db:"user_id"`
	Category  NotificationCategory `json:"category" db:"category"`
	Type      NotificationType     `json:"type" db:"type"`
	Title     string               `json:"title" db:"title"`
	Content   string               `json:"content" db:"content"`
	IconURL   *string              `json:"icon_url,omitempty" db:"icon_url"`
	CreatedAt time.Time            `json:"created_at" db:"created_at"`
	ReadAt    *time.Time           `json:"read_at,omitempty" db:"read_at"`
}

// Validate validates the notification fields
func (n *Notification) Validate() error {
	if n.UserID <= 0 {
		return fmt.Errorf("user_id is required and must be positive")
	}
	if !n.Category.IsValid() {
		return fmt.Errorf("invalid category: %s", n.Category)
	}
	if !n.Type.IsValid() {
		return fmt.Errorf("invalid type: %s", n.Type)
	}
	if n.Title == "" {
		return fmt.Errorf("title is required")
	}
	if len(n.Title) > 255 {
		return fmt.Errorf("title must be 255 characters or less")
	}
	if n.Content == "" {
		return fmt.Errorf("content is required")
	}
	if n.IconURL != nil && len(*n.IconURL) > 500 {
		return fmt.Errorf("icon_url must be 500 characters or less")
	}
	return nil
}

// GetNotificationsRequest represents the request to get notifications
type GetNotificationsRequest struct {
	Category NotificationCategory `form:"category" binding:"required,oneof=main content"`
	Limit    int                  `form:"limit" binding:"omitempty,min=1,max=100"`
	Offset   int                  `form:"offset" binding:"omitempty,min=0"`
}

// GetNotificationsResponse represents the response for getting notifications
type GetNotificationsResponse struct {
	Notifications []Notification `json:"notifications"`
	Total         int            `json:"total"`
	HasMore       bool           `json:"has_more"`
}

// MarkAsReadResponse represents the response for marking a notification as read
type MarkAsReadResponse struct {
	Success bool       `json:"success"`
	ReadAt  *time.Time `json:"read_at,omitempty"`
}

// MarkAllAsReadRequest represents the request to mark all notifications as read
type MarkAllAsReadRequest struct {
	Category NotificationCategory `json:"category" binding:"required,oneof=main content"`
}

// MarkAllAsReadResponse represents the response for marking all notifications as read
type MarkAllAsReadResponse struct {
	Success     bool `json:"success"`
	MarkedCount int  `json:"marked_count"`
}

// UnreadCountsResponse represents the response for getting unread counts
type UnreadCountsResponse struct {
	Main    int `json:"main"`
	Content int `json:"content"`
}
