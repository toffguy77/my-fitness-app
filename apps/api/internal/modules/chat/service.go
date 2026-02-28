package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/google/uuid"
)

// ServiceInterface defines the contract for the chat service
type ServiceInterface interface {
	GetConversations(ctx context.Context, userID int64) ([]Conversation, error)
	GetOrCreateConversation(ctx context.Context, clientID, curatorID int64) (*Conversation, error)
	GetMessages(ctx context.Context, conversationID string, userID int64, cursor string, limit int) ([]Message, error)
	SendMessage(ctx context.Context, conversationID string, senderID int64, req SendMessageRequest) (*Message, error)
	AddAttachment(ctx context.Context, messageID string, att MessageAttachment) error
	MarkAsRead(ctx context.Context, conversationID string, userID int64) error
	GetUnreadCount(ctx context.Context, userID int64) (int, error)
	CreateFoodEntryFromChat(ctx context.Context, conversationID string, curatorID int64, req CreateFoodEntryRequest) (*Message, error)
	ValidateParticipant(ctx context.Context, conversationID string, userID int64) error
	EnsureConversationsExist(ctx context.Context) error
}

// Service handles chat business logic
type Service struct {
	db  *sql.DB
	log *logger.Logger
}

// NewService creates a new chat service
func NewService(db *database.DB, log *logger.Logger) *Service {
	return &Service{db: db.DB, log: log}
}

// GetConversations retrieves all conversations for a user with last message and unread count
func (s *Service) GetConversations(ctx context.Context, userID int64) ([]Conversation, error) {
	startTime := time.Now()

	query := `
		SELECT c.id, c.client_id, c.curator_id, c.created_at, c.updated_at,
		       u.id AS participant_id, u.full_name AS participant_name,
		       COALESCE(u.avatar_url, '') AS participant_avatar
		FROM conversations c
		JOIN users u ON u.id = CASE WHEN c.client_id = $1 THEN c.curator_id ELSE c.client_id END
		WHERE c.client_id = $1 OR c.curator_id = $1
		ORDER BY c.updated_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return nil, fmt.Errorf("failed to get conversations: %w", err)
	}
	defer rows.Close()

	var conversations []Conversation
	for rows.Next() {
		var conv Conversation
		var participant User
		err := rows.Scan(
			&conv.ID, &conv.ClientID, &conv.CuratorID,
			&conv.CreatedAt, &conv.UpdatedAt,
			&participant.ID, &participant.Name, &participant.AvatarURL,
		)
		if err != nil {
			s.log.Error("Failed to scan conversation", "error", err)
			return nil, fmt.Errorf("failed to scan conversation: %w", err)
		}
		conv.Participant = &participant
		conversations = append(conversations, conv)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate conversations: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"count":   len(conversations),
	})

	// For each conversation, get last message and unread count
	for i := range conversations {
		lastMsg, err := s.getLastMessage(ctx, conversations[i].ID)
		if err == nil {
			conversations[i].LastMessage = lastMsg
		}

		unread, err := s.getConversationUnreadCount(ctx, conversations[i].ID, userID)
		if err == nil {
			conversations[i].UnreadCount = unread
		}
	}

	if conversations == nil {
		conversations = []Conversation{}
	}

	return conversations, nil
}

// getLastMessage retrieves the most recent message in a conversation
func (s *Service) getLastMessage(ctx context.Context, conversationID string) (*Message, error) {
	query := `
		SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.metadata, m.created_at
		FROM messages m
		WHERE m.conversation_id = $1
		ORDER BY m.created_at DESC
		LIMIT 1
	`

	var msg Message
	var content sql.NullString
	var metadata []byte
	err := s.db.QueryRowContext(ctx, query, conversationID).Scan(
		&msg.ID, &msg.ConversationID, &msg.SenderID,
		&msg.Type, &content, &metadata, &msg.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if content.Valid {
		msg.Content = &content.String
	}
	if metadata != nil {
		msg.Metadata = metadata
	}

	return &msg, nil
}

// getConversationUnreadCount returns the number of unread messages in a conversation for a user
func (s *Service) getConversationUnreadCount(ctx context.Context, conversationID string, userID int64) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM messages m
		WHERE m.conversation_id = $1
		AND m.sender_id != $2
		AND m.created_at > COALESCE(
			(SELECT last_read_at FROM message_read_status
			 WHERE conversation_id = $1 AND user_id = $2),
			'1970-01-01'::timestamptz
		)
	`

	var count int
	err := s.db.QueryRowContext(ctx, query, conversationID, userID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// GetOrCreateConversation retrieves an existing conversation or creates a new one
func (s *Service) GetOrCreateConversation(ctx context.Context, clientID, curatorID int64) (*Conversation, error) {
	startTime := time.Now()

	// Try to find existing conversation
	query := `
		SELECT c.id, c.client_id, c.curator_id, c.created_at, c.updated_at,
		       u.id AS participant_id, u.full_name AS participant_name,
		       COALESCE(u.avatar_url, '') AS participant_avatar
		FROM conversations c
		JOIN users u ON u.id = c.curator_id
		WHERE c.client_id = $1 AND c.curator_id = $2
	`

	var conv Conversation
	var participant User
	err := s.db.QueryRowContext(ctx, query, clientID, curatorID).Scan(
		&conv.ID, &conv.ClientID, &conv.CuratorID,
		&conv.CreatedAt, &conv.UpdatedAt,
		&participant.ID, &participant.Name, &participant.AvatarURL,
	)

	if err == nil {
		conv.Participant = &participant
		s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
			"client_id":  clientID,
			"curator_id": curatorID,
			"found":      true,
		})
		return &conv, nil
	}

	if err != sql.ErrNoRows {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"client_id":  clientID,
			"curator_id": curatorID,
		})
		return nil, fmt.Errorf("failed to query conversation: %w", err)
	}

	// Create new conversation
	insertQuery := `
		INSERT INTO conversations (client_id, curator_id)
		VALUES ($1, $2)
		RETURNING id, client_id, curator_id, created_at, updated_at
	`

	err = s.db.QueryRowContext(ctx, insertQuery, clientID, curatorID).Scan(
		&conv.ID, &conv.ClientID, &conv.CuratorID,
		&conv.CreatedAt, &conv.UpdatedAt,
	)
	if err != nil {
		s.log.LogDatabaseQuery(insertQuery, time.Since(startTime), err, map[string]interface{}{
			"client_id":  clientID,
			"curator_id": curatorID,
		})
		return nil, fmt.Errorf("failed to create conversation: %w", err)
	}

	// Fetch participant info
	participantQuery := `SELECT id, full_name, COALESCE(avatar_url, '') FROM users WHERE id = $1`
	err = s.db.QueryRowContext(ctx, participantQuery, curatorID).Scan(
		&participant.ID, &participant.Name, &participant.AvatarURL,
	)
	if err != nil {
		s.log.Warn("Failed to fetch participant info", "error", err)
	}
	conv.Participant = &participant

	s.log.LogBusinessEvent("conversation_created", map[string]interface{}{
		"conversation_id": conv.ID,
		"client_id":       clientID,
		"curator_id":      curatorID,
	})

	return &conv, nil
}

// GetMessages retrieves messages for a conversation with cursor-based pagination
func (s *Service) GetMessages(ctx context.Context, conversationID string, userID int64, cursor string, limit int) ([]Message, error) {
	startTime := time.Now()

	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	var rows *sql.Rows
	var err error

	if cursor == "" {
		query := `
			SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.metadata, m.created_at
			FROM messages m
			WHERE m.conversation_id = $1
			ORDER BY m.created_at DESC
			LIMIT $2
		`
		rows, err = s.db.QueryContext(ctx, query, conversationID, limit)
		if err != nil {
			s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
				"conversation_id": conversationID,
			})
			return nil, fmt.Errorf("failed to get messages: %w", err)
		}
	} else {
		query := `
			SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.metadata, m.created_at
			FROM messages m
			WHERE m.conversation_id = $1
			AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)
			ORDER BY m.created_at DESC
			LIMIT $3
		`
		rows, err = s.db.QueryContext(ctx, query, conversationID, cursor, limit)
		if err != nil {
			s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
				"conversation_id": conversationID,
				"cursor":          cursor,
			})
			return nil, fmt.Errorf("failed to get messages: %w", err)
		}
	}
	defer rows.Close()

	var messages []Message
	var messageIDs []string
	for rows.Next() {
		var msg Message
		var content sql.NullString
		var metadata []byte
		err := rows.Scan(
			&msg.ID, &msg.ConversationID, &msg.SenderID,
			&msg.Type, &content, &metadata, &msg.CreatedAt,
		)
		if err != nil {
			s.log.Error("Failed to scan message", "error", err)
			return nil, fmt.Errorf("failed to scan message: %w", err)
		}

		if content.Valid {
			msg.Content = &content.String
		}
		if metadata != nil {
			msg.Metadata = metadata
		}

		msg.Attachments = []MessageAttachment{}
		messages = append(messages, msg)
		messageIDs = append(messageIDs, msg.ID)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate messages: %w", err)
	}

	s.log.LogDatabaseQuery("GetMessages", time.Since(startTime), nil, map[string]interface{}{
		"conversation_id": conversationID,
		"count":           len(messages),
	})

	// Load attachments for returned messages
	if len(messageIDs) > 0 {
		attachments, err := s.getAttachmentsForMessages(ctx, messageIDs)
		if err != nil {
			s.log.Warn("Failed to load attachments", "error", err)
		} else {
			for i := range messages {
				if atts, ok := attachments[messages[i].ID]; ok {
					messages[i].Attachments = atts
				}
			}
		}
	}

	if messages == nil {
		messages = []Message{}
	}

	return messages, nil
}

// getAttachmentsForMessages loads attachments for a list of message IDs
func (s *Service) getAttachmentsForMessages(ctx context.Context, messageIDs []string) (map[string][]MessageAttachment, error) {
	if len(messageIDs) == 0 {
		return nil, nil
	}

	// Build placeholders for IN clause
	placeholders := ""
	args := make([]interface{}, len(messageIDs))
	for i, id := range messageIDs {
		if i > 0 {
			placeholders += ", "
		}
		placeholders += fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT id, message_id, file_url, file_name, file_size, mime_type
		FROM message_attachments
		WHERE message_id IN (%s)
		ORDER BY created_at ASC
	`, placeholders)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]MessageAttachment)
	for rows.Next() {
		var att MessageAttachment
		var messageID string
		err := rows.Scan(
			&att.ID, &messageID, &att.FileURL, &att.FileName, &att.FileSize, &att.MimeType,
		)
		if err != nil {
			return nil, err
		}
		result[messageID] = append(result[messageID], att)
	}

	return result, rows.Err()
}

// SendMessage creates a new message in a conversation
func (s *Service) SendMessage(ctx context.Context, conversationID string, senderID int64, req SendMessageRequest) (*Message, error) {
	startTime := time.Now()

	messageID := uuid.New().String()

	query := `
		INSERT INTO messages (id, conversation_id, sender_id, type, content)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, conversation_id, sender_id, type, content, metadata, created_at
	`

	var msg Message
	var content sql.NullString
	var metadata []byte
	err := s.db.QueryRowContext(ctx, query,
		messageID, conversationID, senderID, req.Type, req.Content,
	).Scan(
		&msg.ID, &msg.ConversationID, &msg.SenderID,
		&msg.Type, &content, &metadata, &msg.CreatedAt,
	)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"conversation_id": conversationID,
			"sender_id":       senderID,
		})
		return nil, fmt.Errorf("failed to send message: %w", err)
	}

	if content.Valid {
		msg.Content = &content.String
	}
	if metadata != nil {
		msg.Metadata = metadata
	}
	msg.Attachments = []MessageAttachment{}

	// Update conversation updated_at
	updateQuery := `UPDATE conversations SET updated_at = NOW() WHERE id = $1`
	_, err = s.db.ExecContext(ctx, updateQuery, conversationID)
	if err != nil {
		s.log.Warn("Failed to update conversation timestamp", "error", err, "conversation_id", conversationID)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"conversation_id": conversationID,
		"message_id":      msg.ID,
		"sender_id":       senderID,
		"type":            req.Type,
	})

	s.log.LogBusinessEvent("message_sent", map[string]interface{}{
		"conversation_id": conversationID,
		"message_id":      msg.ID,
		"sender_id":       senderID,
		"type":            req.Type,
	})

	return &msg, nil
}

// AddAttachment adds an attachment to a message
func (s *Service) AddAttachment(ctx context.Context, messageID string, att MessageAttachment) error {
	startTime := time.Now()

	attID := uuid.New().String()

	query := `
		INSERT INTO message_attachments (id, message_id, file_url, file_name, file_size, mime_type)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err := s.db.ExecContext(ctx, query,
		attID, messageID, att.FileURL, att.FileName, att.FileSize, att.MimeType,
	)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"message_id": messageID,
		})
		return fmt.Errorf("failed to add attachment: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"message_id":    messageID,
		"attachment_id": attID,
	})

	return nil
}

// MarkAsRead upserts the read status for a user in a conversation
func (s *Service) MarkAsRead(ctx context.Context, conversationID string, userID int64) error {
	startTime := time.Now()

	query := `
		INSERT INTO message_read_status (conversation_id, user_id, last_read_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (conversation_id, user_id)
		DO UPDATE SET last_read_at = NOW()
	`

	_, err := s.db.ExecContext(ctx, query, conversationID, userID)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"conversation_id": conversationID,
			"user_id":         userID,
		})
		return fmt.Errorf("failed to mark as read: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"conversation_id": conversationID,
		"user_id":         userID,
	})

	return nil
}

// GetUnreadCount returns the total number of unread messages across all conversations for a user
func (s *Service) GetUnreadCount(ctx context.Context, userID int64) (int, error) {
	startTime := time.Now()

	query := `
		SELECT COALESCE(SUM(unread), 0)
		FROM (
			SELECT COUNT(*) AS unread
			FROM conversations c
			JOIN messages m ON m.conversation_id = c.id
			WHERE (c.client_id = $1 OR c.curator_id = $1)
			AND m.sender_id != $1
			AND m.created_at > COALESCE(
				(SELECT last_read_at FROM message_read_status
				 WHERE conversation_id = c.id AND user_id = $1),
				'1970-01-01'::timestamptz
			)
		) sub
	`

	var count int
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&count)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, map[string]interface{}{
			"user_id": userID,
		})
		return 0, fmt.Errorf("failed to get unread count: %w", err)
	}

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"user_id": userID,
		"count":   count,
	})

	return count, nil
}

// CreateFoodEntryFromChat creates a food entry on behalf of a client and sends a food_entry message
func (s *Service) CreateFoodEntryFromChat(ctx context.Context, conversationID string, curatorID int64, req CreateFoodEntryRequest) (*Message, error) {
	startTime := time.Now()

	// 1. Get conversation to find client_id
	convQuery := `SELECT client_id, curator_id FROM conversations WHERE id = $1`
	var clientID, convCuratorID int64
	err := s.db.QueryRowContext(ctx, convQuery, conversationID).Scan(&clientID, &convCuratorID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("conversation not found")
		}
		return nil, fmt.Errorf("failed to get conversation: %w", err)
	}

	// Verify the curator is the curator of this conversation
	if convCuratorID != curatorID {
		return nil, fmt.Errorf("only the curator can create food entries in this conversation")
	}

	// 2. Verify active curator-client relationship
	relQuery := `
		SELECT id FROM curator_client_relationships
		WHERE curator_id = $1 AND client_id = $2 AND status = 'active'
		LIMIT 1
	`
	var relID string
	err = s.db.QueryRowContext(ctx, relQuery, curatorID, clientID).Scan(&relID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no active relationship with this client")
		}
		return nil, fmt.Errorf("failed to verify relationship: %w", err)
	}

	// 3. Insert food entry
	entryID := uuid.New().String()
	today := time.Now().Format("2006-01-02")
	nowTime := time.Now().Format("15:04")

	// Create a food_item first for the food entry reference
	foodItemID := uuid.New().String()
	foodItemQuery := `
		INSERT INTO food_items (id, name, category, serving_size, serving_unit,
			calories_per_100, protein_per_100, fat_per_100, carbs_per_100,
			source, verified, created_at, updated_at)
		VALUES ($1, $2, 'chat', $3, 'г', $4, $5, $6, $7, 'user', false, NOW(), NOW())
		ON CONFLICT (id) DO NOTHING
	`

	// Calculate per-100g values from absolute values and weight
	calPer100 := 0.0
	protPer100 := 0.0
	fatPer100 := 0.0
	carbsPer100 := 0.0
	if req.Weight > 0 {
		calPer100 = (req.Calories / req.Weight) * 100
		protPer100 = (req.Protein / req.Weight) * 100
		fatPer100 = (req.Fat / req.Weight) * 100
		carbsPer100 = (req.Carbs / req.Weight) * 100
	}

	_, err = s.db.ExecContext(ctx, foodItemQuery,
		foodItemID, req.FoodName, req.Weight,
		calPer100, protPer100, fatPer100, carbsPer100,
	)
	if err != nil {
		s.log.Error("Failed to create food item for chat entry", "error", err)
		return nil, fmt.Errorf("failed to create food item: %w", err)
	}

	entryQuery := `
		INSERT INTO food_entries (id, user_id, food_id, food_name, meal_type,
			portion_type, portion_amount, calories, protein, fat, carbs,
			time, date, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'grams', $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
	`

	_, err = s.db.ExecContext(ctx, entryQuery,
		entryID, clientID, foodItemID, req.FoodName, req.MealType,
		req.Weight, req.Calories, req.Protein, req.Fat, req.Carbs,
		nowTime, today, curatorID,
	)
	if err != nil {
		s.log.LogDatabaseQuery(entryQuery, time.Since(startTime), err, map[string]interface{}{
			"client_id":  clientID,
			"curator_id": curatorID,
		})
		return nil, fmt.Errorf("failed to create food entry: %w", err)
	}

	// 4. Create food_entry type message with metadata
	metadata := map[string]interface{}{
		"food_entry_id": entryID,
		"food_name":     req.FoodName,
		"meal_type":     req.MealType,
		"weight":        req.Weight,
		"calories":      req.Calories,
		"protein":       req.Protein,
		"fat":           req.Fat,
		"carbs":         req.Carbs,
	}

	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal metadata: %w", err)
	}

	messageID := uuid.New().String()
	content := fmt.Sprintf("%s: %.0f kcal (%.0fg P / %.0fg F / %.0fg C)",
		req.FoodName, req.Calories, req.Protein, req.Fat, req.Carbs)

	msgQuery := `
		INSERT INTO messages (id, conversation_id, sender_id, type, content, metadata)
		VALUES ($1, $2, $3, 'food_entry', $4, $5)
		RETURNING id, conversation_id, sender_id, type, content, metadata, created_at
	`

	var msg Message
	var msgContent sql.NullString
	var msgMetadata []byte
	err = s.db.QueryRowContext(ctx, msgQuery,
		messageID, conversationID, curatorID, content, metadataJSON,
	).Scan(
		&msg.ID, &msg.ConversationID, &msg.SenderID,
		&msg.Type, &msgContent, &msgMetadata, &msg.CreatedAt,
	)
	if err != nil {
		s.log.LogDatabaseQuery(msgQuery, time.Since(startTime), err, map[string]interface{}{
			"conversation_id": conversationID,
			"curator_id":      curatorID,
		})
		return nil, fmt.Errorf("failed to create food entry message: %w", err)
	}

	if msgContent.Valid {
		msg.Content = &msgContent.String
	}
	if msgMetadata != nil {
		msg.Metadata = msgMetadata
	}
	msg.Attachments = []MessageAttachment{}

	// Update conversation updated_at
	updateQuery := `UPDATE conversations SET updated_at = NOW() WHERE id = $1`
	_, err = s.db.ExecContext(ctx, updateQuery, conversationID)
	if err != nil {
		s.log.Warn("Failed to update conversation timestamp", "error", err)
	}

	s.log.LogBusinessEvent("food_entry_created_from_chat", map[string]interface{}{
		"conversation_id": conversationID,
		"entry_id":        entryID,
		"client_id":       clientID,
		"curator_id":      curatorID,
		"food_name":       req.FoodName,
		"calories":        req.Calories,
	})

	s.log.LogDatabaseQuery("CreateFoodEntryFromChat", time.Since(startTime), nil, map[string]interface{}{
		"conversation_id": conversationID,
		"entry_id":        entryID,
	})

	return &msg, nil
}

// ValidateParticipant checks that the user is a participant in the conversation
func (s *Service) ValidateParticipant(ctx context.Context, conversationID string, userID int64) error {
	query := `
		SELECT id FROM conversations
		WHERE id = $1 AND (client_id = $2 OR curator_id = $2)
	`

	var id string
	err := s.db.QueryRowContext(ctx, query, conversationID, userID).Scan(&id)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("user is not a participant in this conversation")
		}
		return fmt.Errorf("failed to validate participant: %w", err)
	}

	return nil
}

// EnsureConversationsExist creates conversations for all active curator-client relationships
// that don't have one yet
func (s *Service) EnsureConversationsExist(ctx context.Context) error {
	startTime := time.Now()

	query := `
		INSERT INTO conversations (client_id, curator_id)
		SELECT ccr.client_id, ccr.curator_id
		FROM curator_client_relationships ccr
		WHERE ccr.status = 'active'
		AND NOT EXISTS (
			SELECT 1 FROM conversations c
			WHERE c.client_id = ccr.client_id AND c.curator_id = ccr.curator_id
		)
	`

	result, err := s.db.ExecContext(ctx, query)
	if err != nil {
		s.log.LogDatabaseQuery(query, time.Since(startTime), err, nil)
		return fmt.Errorf("failed to ensure conversations exist: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()

	s.log.LogDatabaseQuery(query, time.Since(startTime), nil, map[string]interface{}{
		"conversations_created": rowsAffected,
	})

	if rowsAffected > 0 {
		s.log.LogBusinessEvent("conversations_auto_created", map[string]interface{}{
			"count": rowsAffected,
		})
	}

	return nil
}
