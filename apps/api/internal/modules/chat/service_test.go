package chat

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupTestService creates a test service with mock database
func setupTestService(t *testing.T) (*Service, sqlmock.Sqlmock, func()) {
	mockDB, mock, err := sqlmock.New()
	require.NoError(t, err)

	db := &database.DB{DB: mockDB}
	log := logger.New()

	service := NewService(db, log)

	cleanup := func() {
		mockDB.Close()
	}

	return service, mock, cleanup
}

func TestSendMessage(t *testing.T) {
	ctx := context.Background()

	t.Run("successfully sends a text message", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-1"
		senderID := int64(1)
		content := "Hello, world!"
		req := SendMessageRequest{
			Type:    "text",
			Content: &content,
		}

		now := time.Now()

		// Mock INSERT into messages
		msgRows := sqlmock.NewRows([]string{
			"id", "conversation_id", "sender_id", "type", "content", "metadata", "created_at",
		}).AddRow("msg-uuid-1", conversationID, senderID, "text", content, nil, now)

		mock.ExpectQuery(`INSERT INTO messages`).
			WithArgs(
				sqlmock.AnyArg(), // id (UUID)
				conversationID,
				senderID,
				"text",
				&content,
			).
			WillReturnRows(msgRows)

		// Mock UPDATE conversations.updated_at
		mock.ExpectExec(`UPDATE conversations SET updated_at`).
			WithArgs(conversationID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Execute
		msg, err := service.SendMessage(ctx, conversationID, senderID, req)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, msg)
		assert.Equal(t, "msg-uuid-1", msg.ID)
		assert.Equal(t, conversationID, msg.ConversationID)
		assert.Equal(t, senderID, msg.SenderID)
		assert.Equal(t, "text", msg.Type)
		assert.Equal(t, content, *msg.Content)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("sends message without content (image type)", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-2"
		senderID := int64(2)
		req := SendMessageRequest{
			Type:    "image",
			Content: nil,
		}

		now := time.Now()

		msgRows := sqlmock.NewRows([]string{
			"id", "conversation_id", "sender_id", "type", "content", "metadata", "created_at",
		}).AddRow("msg-uuid-2", conversationID, senderID, "image", nil, nil, now)

		mock.ExpectQuery(`INSERT INTO messages`).
			WithArgs(
				sqlmock.AnyArg(),
				conversationID,
				senderID,
				"image",
				nil,
			).
			WillReturnRows(msgRows)

		mock.ExpectExec(`UPDATE conversations SET updated_at`).
			WithArgs(conversationID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Execute
		msg, err := service.SendMessage(ctx, conversationID, senderID, req)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, msg)
		assert.Equal(t, "image", msg.Type)
		assert.Nil(t, msg.Content)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-3"
		senderID := int64(1)
		content := "test"
		req := SendMessageRequest{
			Type:    "text",
			Content: &content,
		}

		mock.ExpectQuery(`INSERT INTO messages`).
			WithArgs(
				sqlmock.AnyArg(),
				conversationID,
				senderID,
				"text",
				&content,
			).
			WillReturnError(sql.ErrConnDone)

		// Execute
		msg, err := service.SendMessage(ctx, conversationID, senderID, req)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, msg)
		assert.Contains(t, err.Error(), "failed to send message")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestValidateParticipant(t *testing.T) {
	ctx := context.Background()

	t.Run("allows client participant", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-1"
		userID := int64(10) // client

		rows := sqlmock.NewRows([]string{"id"}).
			AddRow(conversationID)

		mock.ExpectQuery(`SELECT id FROM conversations`).
			WithArgs(conversationID, userID).
			WillReturnRows(rows)

		// Execute
		err := service.ValidateParticipant(ctx, conversationID, userID)

		// Assert
		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("allows curator participant", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-1"
		userID := int64(20) // curator

		rows := sqlmock.NewRows([]string{"id"}).
			AddRow(conversationID)

		mock.ExpectQuery(`SELECT id FROM conversations`).
			WithArgs(conversationID, userID).
			WillReturnRows(rows)

		// Execute
		err := service.ValidateParticipant(ctx, conversationID, userID)

		// Assert
		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("rejects non-participant", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-1"
		userID := int64(99) // not in conversation

		mock.ExpectQuery(`SELECT id FROM conversations`).
			WithArgs(conversationID, userID).
			WillReturnError(sql.ErrNoRows)

		// Execute
		err := service.ValidateParticipant(ctx, conversationID, userID)

		// Assert
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user is not a participant")
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-1"
		userID := int64(10)

		mock.ExpectQuery(`SELECT id FROM conversations`).
			WithArgs(conversationID, userID).
			WillReturnError(sql.ErrConnDone)

		// Execute
		err := service.ValidateParticipant(ctx, conversationID, userID)

		// Assert
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to validate participant")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestMarkAsRead(t *testing.T) {
	ctx := context.Background()

	t.Run("successfully marks messages as read (insert)", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-1"
		userID := int64(10)

		mock.ExpectExec(`INSERT INTO message_read_status`).
			WithArgs(conversationID, userID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Execute
		err := service.MarkAsRead(ctx, conversationID, userID)

		// Assert
		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("successfully updates existing read status (upsert)", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-2"
		userID := int64(20)

		// The UPSERT should succeed regardless of whether a row existed
		mock.ExpectExec(`INSERT INTO message_read_status`).
			WithArgs(conversationID, userID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Execute
		err := service.MarkAsRead(ctx, conversationID, userID)

		// Assert
		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		conversationID := "conv-uuid-3"
		userID := int64(30)

		mock.ExpectExec(`INSERT INTO message_read_status`).
			WithArgs(conversationID, userID).
			WillReturnError(sql.ErrConnDone)

		// Execute
		err := service.MarkAsRead(ctx, conversationID, userID)

		// Assert
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to mark as read")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestGetUnreadCount(t *testing.T) {
	ctx := context.Background()

	t.Run("returns correct unread count", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(10)

		rows := sqlmock.NewRows([]string{"count"}).AddRow(7)

		mock.ExpectQuery(`SELECT COALESCE\(SUM\(unread\), 0\)`).
			WithArgs(userID).
			WillReturnRows(rows)

		// Execute
		count, err := service.GetUnreadCount(ctx, userID)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, 7, count)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns zero when no unread messages", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(20)

		rows := sqlmock.NewRows([]string{"count"}).AddRow(0)

		mock.ExpectQuery(`SELECT COALESCE\(SUM\(unread\), 0\)`).
			WithArgs(userID).
			WillReturnRows(rows)

		// Execute
		count, err := service.GetUnreadCount(ctx, userID)

		// Assert
		require.NoError(t, err)
		assert.Equal(t, 0, count)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(30)

		mock.ExpectQuery(`SELECT COALESCE\(SUM\(unread\), 0\)`).
			WithArgs(userID).
			WillReturnError(sql.ErrConnDone)

		// Execute
		count, err := service.GetUnreadCount(ctx, userID)

		// Assert
		assert.Error(t, err)
		assert.Equal(t, 0, count)
		assert.Contains(t, err.Error(), "failed to get unread count")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestGetConversations(t *testing.T) {
	ctx := context.Background()

	t.Run("returns empty list when no conversations", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(10)

		rows := sqlmock.NewRows([]string{
			"id", "client_id", "curator_id", "created_at", "updated_at",
			"participant_id", "participant_name", "participant_avatar",
		})

		mock.ExpectQuery(`SELECT c.id, c.client_id, c.curator_id`).
			WithArgs(userID).
			WillReturnRows(rows)

		// Execute
		conversations, err := service.GetConversations(ctx, userID)

		// Assert
		require.NoError(t, err)
		assert.NotNil(t, conversations)
		assert.Len(t, conversations, 0)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		userID := int64(10)

		mock.ExpectQuery(`SELECT c.id, c.client_id, c.curator_id`).
			WithArgs(userID).
			WillReturnError(sql.ErrConnDone)

		// Execute
		conversations, err := service.GetConversations(ctx, userID)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, conversations)
		assert.Contains(t, err.Error(), "failed to get conversations")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestEnsureConversationsExist(t *testing.T) {
	ctx := context.Background()

	t.Run("creates missing conversations", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectExec(`INSERT INTO conversations`).
			WillReturnResult(sqlmock.NewResult(0, 3))

		// Execute
		err := service.EnsureConversationsExist(ctx)

		// Assert
		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("succeeds when no conversations need creating", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectExec(`INSERT INTO conversations`).
			WillReturnResult(sqlmock.NewResult(0, 0))

		// Execute
		err := service.EnsureConversationsExist(ctx)

		// Assert
		require.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		mock.ExpectExec(`INSERT INTO conversations`).
			WillReturnError(sql.ErrConnDone)

		// Execute
		err := service.EnsureConversationsExist(ctx)

		// Assert
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to ensure conversations exist")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestAddAttachment(t *testing.T) {
	ctx := context.Background()

	t.Run("successfully adds attachment", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		messageID := "msg-uuid-1"
		att := MessageAttachment{
			FileURL:  "https://s3.example.com/file.jpg",
			FileName: "photo.jpg",
			FileSize: 12345,
			MimeType: "image/jpeg",
		}

		mock.ExpectExec(`INSERT INTO message_attachments`).
			WithArgs(
				sqlmock.AnyArg(), // id
				messageID,
				att.FileURL,
				att.FileName,
				att.FileSize,
				att.MimeType,
			).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Execute
		err := service.AddAttachment(ctx, messageID, att)

		// Assert
		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("returns error on database failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()

		messageID := "msg-uuid-2"
		att := MessageAttachment{
			FileURL:  "https://s3.example.com/file.pdf",
			FileName: "doc.pdf",
			FileSize: 54321,
			MimeType: "application/pdf",
		}

		mock.ExpectExec(`INSERT INTO message_attachments`).
			WithArgs(
				sqlmock.AnyArg(),
				messageID,
				att.FileURL,
				att.FileName,
				att.FileSize,
				att.MimeType,
			).
			WillReturnError(sql.ErrConnDone)

		// Execute
		err := service.AddAttachment(ctx, messageID, att)

		// Assert
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to add attachment")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}
