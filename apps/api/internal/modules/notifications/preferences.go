package notifications

import (
	"context"
	"fmt"
	"time"
)

// GetPreferences retrieves content notification preferences for a user.
// Returns empty muted_categories and muted=false for new users (opt-out model).
func (s *Service) GetPreferences(ctx context.Context, userID int64) (*ContentNotificationPreferences, error) {
	startTime := time.Now()

	// Query muted categories
	categoriesQuery := `
		SELECT category FROM content_notification_preferences
		WHERE user_id = $1
		ORDER BY category
	`

	rows, err := s.db.QueryContext(ctx, categoriesQuery, userID)
	if err != nil {
		s.log.LogDatabaseQuery(categoriesQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("failed to query muted categories: %w", err)
	}
	defer rows.Close()

	mutedCategories := []string{}
	for rows.Next() {
		var category string
		if err := rows.Scan(&category); err != nil {
			s.log.Error("Failed to scan muted category", "error", err)
			return nil, fmt.Errorf("failed to scan muted category: %w", err)
		}
		mutedCategories = append(mutedCategories, category)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating muted categories: %w", err)
	}

	// Query mute status
	muteQuery := `
		SELECT EXISTS(SELECT 1 FROM content_notification_mute WHERE user_id = $1)
	`

	var muted bool
	err = s.db.QueryRowContext(ctx, muteQuery, userID).Scan(&muted)
	if err != nil {
		s.log.LogDatabaseQuery(muteQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("failed to query mute status: %w", err)
	}

	s.log.LogDatabaseQuery(categoriesQuery, time.Since(startTime), nil, map[string]interface{}{
		"user_id":          userID,
		"muted_categories": len(mutedCategories),
		"muted":            muted,
	})

	return &ContentNotificationPreferences{
		MutedCategories: mutedCategories,
		Muted:           muted,
	}, nil
}

// UpdatePreferences updates content notification preferences for a user.
// In a transaction: replaces muted categories and toggles the global mute status.
func (s *Service) UpdatePreferences(ctx context.Context, userID int64, req UpdatePreferencesRequest) error {
	startTime := time.Now()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Delete existing muted categories for this user
	deleteQuery := `
		DELETE FROM content_notification_preferences WHERE user_id = $1
	`
	_, err = tx.ExecContext(ctx, deleteQuery, userID)
	if err != nil {
		s.log.LogDatabaseQuery(deleteQuery, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return fmt.Errorf("failed to delete existing muted categories: %w", err)
	}

	// Insert new muted categories
	if len(req.MutedCategories) > 0 {
		insertQuery := `
			INSERT INTO content_notification_preferences (user_id, category, created_at)
			VALUES ($1, $2, NOW())
		`
		for _, category := range req.MutedCategories {
			_, err = tx.ExecContext(ctx, insertQuery, userID, category)
			if err != nil {
				s.log.LogDatabaseQuery(insertQuery, time.Since(startTime), err, map[string]interface{}{
					"user_id":  userID,
					"category": category,
				})
				return fmt.Errorf("failed to insert muted category %s: %w", category, err)
			}
		}
	}

	// Toggle global mute status
	if req.Muted {
		muteQuery := `
			INSERT INTO content_notification_mute (user_id, muted_at)
			VALUES ($1, NOW())
			ON CONFLICT (user_id) DO NOTHING
		`
		_, err = tx.ExecContext(ctx, muteQuery, userID)
		if err != nil {
			s.log.LogDatabaseQuery(muteQuery, time.Since(startTime), err, map[string]interface{}{
				"user_id": userID,
			})
			return fmt.Errorf("failed to mute notifications: %w", err)
		}
	} else {
		unmuteQuery := `
			DELETE FROM content_notification_mute WHERE user_id = $1
		`
		_, err = tx.ExecContext(ctx, unmuteQuery, userID)
		if err != nil {
			s.log.LogDatabaseQuery(unmuteQuery, time.Since(startTime), err, map[string]interface{}{
				"user_id": userID,
			})
			return fmt.Errorf("failed to unmute notifications: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	s.log.LogDatabaseQuery("UpdatePreferences", time.Since(startTime), nil, map[string]interface{}{
		"user_id":          userID,
		"muted_categories": len(req.MutedCategories),
		"muted":            req.Muted,
	})

	return nil
}
