package admin

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
)

// ServiceInterface defines the contract for the admin service
type ServiceInterface interface {
	GetUsers(ctx context.Context) ([]AdminUser, error)
	GetCurators(ctx context.Context) ([]CuratorLoad, error)
	ChangeRole(ctx context.Context, userID int64, newRole string) error
	AssignCurator(ctx context.Context, clientID, curatorID int64) error
	GetConversations(ctx context.Context) ([]AdminConversation, error)
	GetConversationMessages(ctx context.Context, conversationID string, cursor string, limit int) ([]AdminMessage, error)
}

// Service handles admin business logic
type Service struct {
	db  *database.DB
	log *logger.Logger
}

// NewService creates a new admin service
func NewService(db *database.DB, log *logger.Logger) *Service {
	return &Service{
		db:  db,
		log: log,
	}
}

// GetUsers returns all users with role, curator assignment, and client count
func (s *Service) GetUsers(ctx context.Context) ([]AdminUser, error) {
	startTime := time.Now()

	query := `
		SELECT u.id, u.email, COALESCE(u.name, '') AS name, u.role,
		       COALESCE(u.avatar_url, '') AS avatar_url,
		       COALESCE(curator.name, '') AS curator_name,
		       ccr_client.curator_id,
		       COALESCE(client_counts.cnt, 0) AS client_count,
		       u.created_at,
		       last_tokens.last_login
		FROM users u
		LEFT JOIN curator_client_relationships ccr_client
			ON ccr_client.client_id = u.id AND ccr_client.status = 'active'
		LEFT JOIN users curator
			ON curator.id = ccr_client.curator_id
		LEFT JOIN (
			SELECT curator_id, COUNT(*) AS cnt
			FROM curator_client_relationships
			WHERE status = 'active'
			GROUP BY curator_id
		) client_counts ON client_counts.curator_id = u.id
		LEFT JOIN (
			SELECT user_id, MAX(created_at) AS last_login
			FROM refresh_tokens
			GROUP BY user_id
		) last_tokens ON last_tokens.user_id = u.id
		ORDER BY u.created_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, nil)
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []AdminUser
	for rows.Next() {
		var u AdminUser
		var curatorName sql.NullString
		var curatorID sql.NullInt64
		var lastLogin sql.NullTime

		if err := rows.Scan(
			&u.ID, &u.Email, &u.Name, &u.Role, &u.AvatarURL,
			&curatorName, &curatorID, &u.ClientCount,
			&u.CreatedAt, &lastLogin,
		); err != nil {
			s.log.Error("Failed to scan user row", "error", err)
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}

		if curatorName.Valid {
			u.CuratorName = &curatorName.String
		}
		if curatorID.Valid {
			u.CuratorID = &curatorID.Int64
		}
		if lastLogin.Valid {
			u.LastLoginAt = &lastLogin.Time
		}

		users = append(users, u)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating users: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"count": len(users),
	})

	if users == nil {
		users = []AdminUser{}
	}

	return users, nil
}

// GetCurators returns all coordinators with their active client counts
func (s *Service) GetCurators(ctx context.Context) ([]CuratorLoad, error) {
	startTime := time.Now()

	query := `
		SELECT u.id, COALESCE(u.name, '') AS name, u.email,
		       COALESCE(u.avatar_url, '') AS avatar_url,
		       COUNT(ccr.client_id) AS client_count
		FROM users u
		LEFT JOIN curator_client_relationships ccr
			ON ccr.curator_id = u.id AND ccr.status = 'active'
		WHERE u.role = 'coordinator'
		GROUP BY u.id, u.name, u.email, u.avatar_url
		ORDER BY client_count DESC, name ASC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, nil)
		return nil, fmt.Errorf("failed to query curators: %w", err)
	}
	defer rows.Close()

	var curators []CuratorLoad
	for rows.Next() {
		var c CuratorLoad
		if err := rows.Scan(&c.ID, &c.Name, &c.Email, &c.AvatarURL, &c.ClientCount); err != nil {
			s.log.Error("Failed to scan curator row", "error", err)
			return nil, fmt.Errorf("failed to scan curator: %w", err)
		}
		curators = append(curators, c)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating curators: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"count": len(curators),
	})

	if curators == nil {
		curators = []CuratorLoad{}
	}

	return curators, nil
}

// ChangeRole changes a user's role. When demoting a curator (coordinator -> client),
// it reassigns all their active clients to the least-loaded remaining curator within a transaction.
func (s *Service) ChangeRole(ctx context.Context, userID int64, newRole string) error {
	startTime := time.Now()

	// Get current role
	var currentRole string
	err := s.db.QueryRowContext(ctx, `SELECT role FROM users WHERE id = $1`, userID).Scan(&currentRole)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("user not found")
		}
		return fmt.Errorf("failed to get user role: %w", err)
	}

	if currentRole == newRole {
		return nil // no-op
	}

	// Cannot change super_admin role
	if currentRole == "super_admin" {
		return fmt.Errorf("cannot change super_admin role")
	}

	// If demoting coordinator -> client, handle client reassignment in a transaction
	if currentRole == "coordinator" && newRole == "client" {
		return s.demoteCurator(ctx, userID)
	}

	// Simple role change (client -> coordinator)
	_, err = s.db.ExecContext(ctx, `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, newRole, userID)
	if err != nil {
		return fmt.Errorf("failed to update role: %w", err)
	}

	s.log.LogBusinessEvent("role_changed", map[string]interface{}{
		"user_id":  userID,
		"old_role": currentRole,
		"new_role": newRole,
		"duration": time.Since(startTime).String(),
	})

	return nil
}

// demoteCurator handles the complex case of demoting a coordinator to client:
// 1. Get all active clients of the curator
// 2. Mark all their relationships as inactive
// 3. Change role to client
// 4. Reassign each orphaned client to the least-loaded remaining curator
// 5. Create new conversations for reassigned clients
func (s *Service) demoteCurator(ctx context.Context, curatorID int64) error {
	startTime := time.Now()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// 1. Get active clients of this curator
	clientRows, err := tx.QueryContext(ctx, `
		SELECT client_id FROM curator_client_relationships
		WHERE curator_id = $1 AND status = 'active'
	`, curatorID)
	if err != nil {
		return fmt.Errorf("failed to get curator clients: %w", err)
	}

	var orphanedClients []int64
	for clientRows.Next() {
		var clientID int64
		if err := clientRows.Scan(&clientID); err != nil {
			clientRows.Close()
			return fmt.Errorf("failed to scan client: %w", err)
		}
		orphanedClients = append(orphanedClients, clientID)
	}
	clientRows.Close()

	if err := clientRows.Err(); err != nil {
		return fmt.Errorf("error iterating clients: %w", err)
	}

	// 2. Deactivate all relationships for this curator
	_, err = tx.ExecContext(ctx, `
		UPDATE curator_client_relationships SET status = 'inactive'
		WHERE curator_id = $1 AND status = 'active'
	`, curatorID)
	if err != nil {
		return fmt.Errorf("failed to deactivate relationships: %w", err)
	}

	// 3. Change role to client
	_, err = tx.ExecContext(ctx, `
		UPDATE users SET role = 'client', updated_at = NOW() WHERE id = $1
	`, curatorID)
	if err != nil {
		return fmt.Errorf("failed to update role: %w", err)
	}

	// 4. Reassign orphaned clients
	if len(orphanedClients) > 0 {
		// Check if there are remaining curators
		var remainingCount int
		err = tx.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM users WHERE role = 'coordinator' AND id != $1
		`, curatorID).Scan(&remainingCount)
		if err != nil {
			return fmt.Errorf("failed to count remaining curators: %w", err)
		}

		if remainingCount == 0 {
			return fmt.Errorf("cannot demote: no remaining curators to reassign %d clients", len(orphanedClients))
		}

		for _, clientID := range orphanedClients {
			// Find least-loaded curator (excluding the one being demoted)
			var newCuratorID int64
			err = tx.QueryRowContext(ctx, `
				SELECT u.id
				FROM users u
				LEFT JOIN curator_client_relationships ccr
					ON ccr.curator_id = u.id AND ccr.status = 'active'
				WHERE u.role = 'coordinator' AND u.id != $1
				GROUP BY u.id
				ORDER BY COUNT(ccr.client_id) ASC
				LIMIT 1
			`, curatorID).Scan(&newCuratorID)
			if err != nil {
				return fmt.Errorf("failed to find curator for client %d: %w", clientID, err)
			}

			// Create new relationship
			_, err = tx.ExecContext(ctx, `
				INSERT INTO curator_client_relationships (curator_id, client_id, status)
				VALUES ($1, $2, 'active')
				ON CONFLICT (curator_id, client_id) DO UPDATE SET status = 'active'
			`, newCuratorID, clientID)
			if err != nil {
				return fmt.Errorf("failed to create relationship for client %d: %w", clientID, err)
			}

			// Create conversation for the new pair
			_, err = tx.ExecContext(ctx, `
				INSERT INTO conversations (client_id, curator_id)
				VALUES ($1, $2)
				ON CONFLICT (client_id, curator_id) DO NOTHING
			`, clientID, newCuratorID)
			if err != nil {
				return fmt.Errorf("failed to create conversation for client %d: %w", clientID, err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	s.log.LogBusinessEvent("curator_demoted", map[string]interface{}{
		"curator_id":       curatorID,
		"orphaned_clients": len(orphanedClients),
		"duration":         time.Since(startTime).String(),
	})

	return nil
}

// AssignCurator creates a new curator-client relationship and conversation
func (s *Service) AssignCurator(ctx context.Context, clientID, curatorID int64) error {
	startTime := time.Now()

	// Verify client exists and is a client
	var clientRole string
	err := s.db.QueryRowContext(ctx, `SELECT role FROM users WHERE id = $1`, clientID).Scan(&clientRole)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("client not found")
		}
		return fmt.Errorf("failed to verify client: %w", err)
	}
	if clientRole != "client" {
		return fmt.Errorf("user %d is not a client (role: %s)", clientID, clientRole)
	}

	// Verify curator exists and is a coordinator
	var curatorRole string
	err = s.db.QueryRowContext(ctx, `SELECT role FROM users WHERE id = $1`, curatorID).Scan(&curatorRole)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("curator not found")
		}
		return fmt.Errorf("failed to verify curator: %w", err)
	}
	if curatorRole != "coordinator" {
		return fmt.Errorf("user %d is not a coordinator (role: %s)", curatorID, curatorRole)
	}

	// Deactivate existing relationship for this client (if any)
	_, err = s.db.ExecContext(ctx, `
		UPDATE curator_client_relationships SET status = 'inactive'
		WHERE client_id = $1 AND status = 'active'
	`, clientID)
	if err != nil {
		return fmt.Errorf("failed to deactivate old relationship: %w", err)
	}

	// Create new relationship
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO curator_client_relationships (curator_id, client_id, status)
		VALUES ($1, $2, 'active')
		ON CONFLICT (curator_id, client_id) DO UPDATE SET status = 'active'
	`, curatorID, clientID)
	if err != nil {
		return fmt.Errorf("failed to create relationship: %w", err)
	}

	// Ensure conversation exists
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO conversations (client_id, curator_id)
		VALUES ($1, $2)
		ON CONFLICT (client_id, curator_id) DO NOTHING
	`, clientID, curatorID)
	if err != nil {
		return fmt.Errorf("failed to create conversation: %w", err)
	}

	s.log.LogBusinessEvent("curator_assigned", map[string]interface{}{
		"client_id":  clientID,
		"curator_id": curatorID,
		"duration":   time.Since(startTime).String(),
	})

	return nil
}

// GetConversations returns all conversations with participant names and message counts
func (s *Service) GetConversations(ctx context.Context) ([]AdminConversation, error) {
	startTime := time.Now()

	query := `
		SELECT c.id, c.client_id, COALESCE(client.name, '') AS client_name,
		       c.curator_id, COALESCE(curator.name, '') AS curator_name,
		       COALESCE(msg_counts.cnt, 0) AS message_count,
		       c.updated_at
		FROM conversations c
		JOIN users client ON client.id = c.client_id
		JOIN users curator ON curator.id = c.curator_id
		LEFT JOIN (
			SELECT conversation_id, COUNT(*) AS cnt
			FROM messages
			GROUP BY conversation_id
		) msg_counts ON msg_counts.conversation_id = c.id
		ORDER BY c.updated_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, nil)
		return nil, fmt.Errorf("failed to query conversations: %w", err)
	}
	defer rows.Close()

	var conversations []AdminConversation
	for rows.Next() {
		var conv AdminConversation
		if err := rows.Scan(
			&conv.ID, &conv.ClientID, &conv.ClientName,
			&conv.CuratorID, &conv.CuratorName,
			&conv.MessageCount, &conv.UpdatedAt,
		); err != nil {
			s.log.Error("Failed to scan conversation", "error", err)
			return nil, fmt.Errorf("failed to scan conversation: %w", err)
		}
		conversations = append(conversations, conv)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating conversations: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"count": len(conversations),
	})

	if conversations == nil {
		conversations = []AdminConversation{}
	}

	return conversations, nil
}

// GetConversationMessages returns messages for a conversation with sender names (read-only, for admin)
func (s *Service) GetConversationMessages(ctx context.Context, conversationID string, cursor string, limit int) ([]AdminMessage, error) {
	startTime := time.Now()

	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	// Verify conversation exists
	var exists bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1)`, conversationID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to check conversation: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("conversation not found")
	}

	var rows *sql.Rows

	if cursor == "" {
		query := `
			SELECT m.id, m.sender_id, COALESCE(u.name, '') AS sender_name,
			       m.type, m.content, m.created_at
			FROM messages m
			JOIN users u ON u.id = m.sender_id
			WHERE m.conversation_id = $1
			ORDER BY m.created_at DESC
			LIMIT $2
		`
		rows, err = s.db.QueryContext(ctx, query, conversationID, limit)
	} else {
		query := `
			SELECT m.id, m.sender_id, COALESCE(u.name, '') AS sender_name,
			       m.type, m.content, m.created_at
			FROM messages m
			JOIN users u ON u.id = m.sender_id
			WHERE m.conversation_id = $1
			AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)
			ORDER BY m.created_at DESC
			LIMIT $3
		`
		rows, err = s.db.QueryContext(ctx, query, conversationID, cursor, limit)
	}

	if err != nil {
		s.log.LogDatabaseQuery("GetConversationMessages", time.Since(startTime), err, map[string]interface{}{
			"conversation_id": conversationID,
		})
		return nil, fmt.Errorf("failed to query messages: %w", err)
	}
	defer rows.Close()

	var messages []AdminMessage
	for rows.Next() {
		var msg AdminMessage
		var content sql.NullString
		if err := rows.Scan(
			&msg.ID, &msg.SenderID, &msg.SenderName,
			&msg.Type, &content, &msg.CreatedAt,
		); err != nil {
			s.log.Error("Failed to scan message", "error", err)
			return nil, fmt.Errorf("failed to scan message: %w", err)
		}
		if content.Valid {
			msg.Content = &content.String
		}
		messages = append(messages, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating messages: %w", err)
	}

	s.log.LogDatabaseQuery("GetConversationMessages", time.Since(startTime), nil, map[string]interface{}{
		"conversation_id": conversationID,
		"count":           len(messages),
	})

	if messages == nil {
		messages = []AdminMessage{}
	}

	return messages, nil
}
