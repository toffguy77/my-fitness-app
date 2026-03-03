package middleware

import (
	"context"
	"time"

	"github.com/burcev/api/internal/shared/database"
)

// DefaultTimezone is used when user has no timezone set
const DefaultTimezone = "Europe/Moscow"

// GetUserTimezone loads the user's timezone from user_settings.
// Returns the timezone Location, falling back to Europe/Moscow.
func GetUserTimezone(ctx context.Context, db *database.DB, userID int64) *time.Location {
	var tz string
	err := db.QueryRowContext(ctx,
		"SELECT COALESCE(timezone, 'Europe/Moscow') FROM user_settings WHERE user_id = $1",
		userID,
	).Scan(&tz)

	if err != nil || tz == "" {
		tz = DefaultTimezone
	}

	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc, _ = time.LoadLocation(DefaultTimezone)
	}

	return loc
}
