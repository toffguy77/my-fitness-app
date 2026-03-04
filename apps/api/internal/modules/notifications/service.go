package notifications

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/google/uuid"
)

// Service handles notifications business logic
type Service struct {
	db  *database.DB
	log *logger.Logger
}

// NewService creates a new notifications service
func NewService(db *database.DB, log *logger.Logger) *Service {
	return &Service{
		db:  db,
		log: log,
	}
}

// GetNotifications retrieves notifications for a user with pagination and filtering
func (s *Service) GetNotifications(ctx context.Context, userID int64, category NotificationCategory, limit, offset int) (*GetNotificationsResponse, error) {
	startTime := time.Now()

	// Validate category
	if !category.IsValid() {
		return nil, fmt.Errorf("invalid category: %s", category)
	}

	// Set default limit if not provided
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	// Query to get notifications with pagination
	query := `
		SELECT id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category
		FROM notifications
		WHERE user_id = $1 AND category = $2
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := s.db.QueryContext(ctx, query, userID, category, limit, offset)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":  userID,
			"category": category,
			"limit":    limit,
			"offset":   offset,
		})
		return nil, fmt.Errorf("failed to query notifications: %w", err)
	}
	defer rows.Close()

	notifications := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		err := rows.Scan(
			&n.ID,
			&n.UserID,
			&n.Category,
			&n.Type,
			&n.Title,
			&n.Content,
			&n.IconURL,
			&n.CreatedAt,
			&n.ReadAt,
			&n.ActionURL,
			&n.ContentCategory,
		)
		if err != nil {
			s.log.Error("Failed to scan notification", "error", err)
			return nil, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, n)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notifications: %w", err)
	}

	// Get total count for this category
	countQuery := `
		SELECT COUNT(*)
		FROM notifications
		WHERE user_id = $1 AND category = $2
	`

	var total int
	err = s.db.QueryRowContext(ctx, countQuery, userID, category).Scan(&total)
	if err != nil {
		s.log.LogDatabaseQuery(countQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id":  userID,
			"category": category,
		})
		return nil, fmt.Errorf("failed to count notifications: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":  userID,
		"category": category,
		"count":    len(notifications),
		"total":    total,
	})

	// Determine if there are more notifications
	hasMore := (offset + len(notifications)) < total

	return &GetNotificationsResponse{
		Notifications: notifications,
		Total:         total,
		HasMore:       hasMore,
	}, nil
}

// MarkAsRead marks a single notification as read
func (s *Service) MarkAsRead(ctx context.Context, userID int64, notificationID string) (*time.Time, error) {
	startTime := time.Now()

	// Validate notification ID is a valid UUID
	if _, err := uuid.Parse(notificationID); err != nil {
		return nil, fmt.Errorf("invalid notification ID format: %w", err)
	}

	// Update query with user_id check to ensure user owns the notification
	query := `
		UPDATE notifications
		SET read_at = NOW()
		WHERE id = $1 AND user_id = $2 AND read_at IS NULL
		RETURNING read_at
	`

	var readAt time.Time
	err := s.db.QueryRowContext(ctx, query, notificationID, userID).Scan(&readAt)
	if err != nil {
		if err == sql.ErrNoRows {
			s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
				"notification_id": notificationID,
				"user_id":         userID,
			})
			return nil, fmt.Errorf("notification not found or already read")
		}
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"notification_id": notificationID,
			"user_id":         userID,
		})
		return nil, fmt.Errorf("failed to mark notification as read: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"notification_id": notificationID,
		"user_id":         userID,
		"read_at":         readAt,
	})

	return &readAt, nil
}

// MarkAllAsRead marks all notifications in a category as read
func (s *Service) MarkAllAsRead(ctx context.Context, userID int64, category NotificationCategory) (int, error) {
	startTime := time.Now()

	// Validate category
	if !category.IsValid() {
		return 0, fmt.Errorf("invalid category: %s", category)
	}

	// Update all unread notifications for the user in the specified category
	query := `
		UPDATE notifications
		SET read_at = NOW()
		WHERE user_id = $1 AND category = $2 AND read_at IS NULL
	`

	result, err := s.db.ExecContext(ctx, query, userID, category)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":  userID,
			"category": category,
		})
		return 0, fmt.Errorf("failed to mark all notifications as read: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":       userID,
		"category":      category,
		"rows_affected": rowsAffected,
	})

	return int(rowsAffected), nil
}

// GetUnreadCounts returns the count of unread notifications for both categories
func (s *Service) GetUnreadCounts(ctx context.Context, userID int64) (*UnreadCountsResponse, error) {
	startTime := time.Now()

	query := `
		SELECT
			category,
			COUNT(*) as count
		FROM notifications
		WHERE user_id = $1 AND read_at IS NULL
		GROUP BY category
	`

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("failed to query unread counts: %w", err)
	}
	defer rows.Close()

	counts := &UnreadCountsResponse{
		Main:    0,
		Content: 0,
	}

	for rows.Next() {
		var category NotificationCategory
		var count int
		if err := rows.Scan(&category, &count); err != nil {
			s.log.Error("Failed to scan unread count", "error", err)
			return nil, fmt.Errorf("failed to scan unread count: %w", err)
		}

		switch category {
		case CategoryMain:
			counts.Main = count
		case CategoryContent:
			counts.Content = count
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating unread counts: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id":       userID,
		"main_count":    counts.Main,
		"content_count": counts.Content,
	})

	return counts, nil
}

// CreateNotification creates a new notification (for testing/admin use)
func (s *Service) CreateNotification(ctx context.Context, notification *Notification) error {
	startTime := time.Now()

	// Validate notification
	if err := notification.Validate(); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	// Generate UUID if not provided
	if notification.ID == "" {
		notification.ID = uuid.New().String()
	}

	// Set created_at if not provided
	if notification.CreatedAt.IsZero() {
		notification.CreatedAt = time.Now()
	}

	query := `
		INSERT INTO notifications (id, user_id, category, type, title, content, icon_url, created_at, read_at, action_url, content_category)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at
	`

	err := s.db.QueryRowContext(
		ctx,
		query,
		notification.ID,
		notification.UserID,
		notification.Category,
		notification.Type,
		notification.Title,
		notification.Content,
		notification.IconURL,
		notification.CreatedAt,
		notification.ReadAt,
		notification.ActionURL,
		notification.ContentCategory,
	).Scan(&notification.ID, &notification.CreatedAt)

	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id":  notification.UserID,
			"category": notification.Category,
			"type":     notification.Type,
		})
		return fmt.Errorf("failed to create notification: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"notification_id": notification.ID,
		"user_id":         notification.UserID,
		"category":        notification.Category,
		"type":            notification.Type,
	})

	s.log.LogBusinessEvent("notification_created", map[string]interface{}{
		"notification_id": notification.ID,
		"user_id":         notification.UserID,
		"category":        notification.Category,
		"type":            notification.Type,
	})

	return nil
}
