package middleware

import (
	"context"
	"fmt"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
)

// RLSContext middleware sets the PostgreSQL app.current_user_id session variable
// on a dedicated connection for Row Level Security policies.
// Must be applied AFTER RequireAuth middleware.
func RLSContext(db *database.DB, log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.Next()
			return
		}

		userID, ok := userIDInterface.(int64)
		if !ok {
			c.Next()
			return
		}

		conn, err := db.DB.Conn(c.Request.Context())
		if err != nil {
			log.Error("Failed to acquire DB connection for RLS", "error", err)
			c.Next()
			return
		}

		_, err = conn.ExecContext(
			c.Request.Context(),
			"SELECT set_config('app.current_user_id', $1, false)",
			fmt.Sprintf("%d", userID),
		)
		if err != nil {
			log.Error("Failed to set RLS context", "error", err, "user_id", userID)
			conn.Close()
			c.Next()
			return
		}

		ctx := database.WithRLSConn(c.Request.Context(), conn)
		c.Request = c.Request.WithContext(ctx)

		defer func() {
			conn.ExecContext(context.Background(), "RESET app.current_user_id")
			conn.Close()
		}()

		c.Next()
	}
}
