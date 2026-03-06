package admin

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestService(t *testing.T) (*Service, sqlmock.Sqlmock, func()) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	log := logger.New()
	wrappedDB := &database.DB{DB: db}
	service := NewService(wrappedDB, log)

	return service, mock, func() { db.Close() }
}

func TestGetUsers(t *testing.T) {
	t.Run("returns user list", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		now := time.Now()
		lastLogin := now.Add(-1 * time.Hour)
		curatorName := "Curator One"
		curatorID := int64(10)

		rows := sqlmock.NewRows([]string{
			"id", "email", "name", "role", "avatar_url",
			"curator_name", "curator_id", "client_count",
			"created_at", "last_login",
		}).
			AddRow(1, "user@example.com", "User One", "client", "",
				curatorName, curatorID, 0,
				now, lastLogin).
			AddRow(2, "curator@example.com", "Curator One", "coordinator", "https://avatar.url",
				nil, nil, 5,
				now, nil)

		mock.ExpectQuery("SELECT u.id").WillReturnRows(rows)

		users, err := service.GetUsers(ctx)
		assert.NoError(t, err)
		require.Len(t, users, 2)

		assert.Equal(t, int64(1), users[0].ID)
		assert.Equal(t, "user@example.com", users[0].Email)
		assert.Equal(t, "User One", users[0].Name)
		assert.Equal(t, "client", users[0].Role)
		require.NotNil(t, users[0].CuratorName)
		assert.Equal(t, "Curator One", *users[0].CuratorName)
		require.NotNil(t, users[0].CuratorID)
		assert.Equal(t, int64(10), *users[0].CuratorID)
		require.NotNil(t, users[0].LastLoginAt)

		assert.Equal(t, int64(2), users[1].ID)
		assert.Equal(t, "coordinator", users[1].Role)
		assert.Equal(t, 5, users[1].ClientCount)
		assert.Nil(t, users[1].CuratorName)
		assert.Nil(t, users[1].CuratorID)
		assert.Nil(t, users[1].LastLoginAt)
	})

	t.Run("returns empty list when no users", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		rows := sqlmock.NewRows([]string{
			"id", "email", "name", "role", "avatar_url",
			"curator_name", "curator_id", "client_count",
			"created_at", "last_login",
		})

		mock.ExpectQuery("SELECT u.id").WillReturnRows(rows)

		users, err := service.GetUsers(ctx)
		assert.NoError(t, err)
		assert.NotNil(t, users)
		assert.Len(t, users, 0)
	})

	t.Run("returns error on query failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT u.id").WillReturnError(fmt.Errorf("db error"))

		users, err := service.GetUsers(ctx)
		assert.Error(t, err)
		assert.Nil(t, users)
		assert.Contains(t, err.Error(), "failed to query users")
	})
}

func TestGetCurators(t *testing.T) {
	t.Run("returns curator list", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		rows := sqlmock.NewRows([]string{"id", "name", "email", "avatar_url", "client_count"}).
			AddRow(1, "Curator One", "curator1@example.com", "", 5).
			AddRow(2, "Curator Two", "curator2@example.com", "https://avatar.url", 3)

		mock.ExpectQuery("SELECT u.id").WillReturnRows(rows)

		curators, err := service.GetCurators(ctx)
		assert.NoError(t, err)
		require.Len(t, curators, 2)

		assert.Equal(t, int64(1), curators[0].ID)
		assert.Equal(t, "Curator One", curators[0].Name)
		assert.Equal(t, "curator1@example.com", curators[0].Email)
		assert.Equal(t, 5, curators[0].ClientCount)

		assert.Equal(t, int64(2), curators[1].ID)
		assert.Equal(t, 3, curators[1].ClientCount)
	})

	t.Run("returns empty list when no curators", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		rows := sqlmock.NewRows([]string{"id", "name", "email", "avatar_url", "client_count"})
		mock.ExpectQuery("SELECT u.id").WillReturnRows(rows)

		curators, err := service.GetCurators(ctx)
		assert.NoError(t, err)
		assert.NotNil(t, curators)
		assert.Len(t, curators, 0)
	})

	t.Run("returns error on query failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT u.id").WillReturnError(fmt.Errorf("db error"))

		curators, err := service.GetCurators(ctx)
		assert.Error(t, err)
		assert.Nil(t, curators)
		assert.Contains(t, err.Error(), "failed to query curators")
	})
}

func TestChangeRole(t *testing.T) {
	t.Run("promotes client to coordinator", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("client"))

		mock.ExpectExec("UPDATE users SET role").
			WithArgs("coordinator", int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.ChangeRole(ctx, 1, "coordinator")
		assert.NoError(t, err)
	})

	t.Run("no-op when role is the same", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("client"))

		err := service.ChangeRole(ctx, 1, "client")
		assert.NoError(t, err)
	})

	t.Run("returns error for super_admin", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("super_admin"))

		err := service.ChangeRole(ctx, 1, "client")
		assert.Error(t, err)
		assert.Equal(t, "cannot change super_admin role", err.Error())
	})

	t.Run("returns error when user not found", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(999)).
			WillReturnError(sql.ErrNoRows)

		err := service.ChangeRole(ctx, 999, "coordinator")
		assert.Error(t, err)
		assert.Equal(t, "user not found", err.Error())
	})

	t.Run("demotes coordinator to client with no active clients", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("coordinator"))

		// demoteCurator: begin tx
		mock.ExpectBegin()

		// Get active clients - none
		mock.ExpectQuery("SELECT client_id FROM curator_client_relationships").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"client_id"}))

		// Deactivate relationships
		mock.ExpectExec("UPDATE curator_client_relationships SET status").
			WithArgs(int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 0))

		// Change role to client
		mock.ExpectExec("UPDATE users SET role").
			WithArgs(int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		mock.ExpectCommit()

		err := service.ChangeRole(ctx, 1, "client")
		assert.NoError(t, err)
	})

	t.Run("demotes coordinator fails when no remaining curators", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("coordinator"))

		mock.ExpectBegin()

		// Has active clients
		mock.ExpectQuery("SELECT client_id FROM curator_client_relationships").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"client_id"}).AddRow(int64(100)))

		// Deactivate relationships
		mock.ExpectExec("UPDATE curator_client_relationships SET status").
			WithArgs(int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// Change role
		mock.ExpectExec("UPDATE users SET role").
			WithArgs(int64(1)).
			WillReturnResult(sqlmock.NewResult(0, 1))

		// No remaining curators
		mock.ExpectQuery("SELECT COUNT").
			WithArgs(int64(1)).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

		mock.ExpectRollback()

		err := service.ChangeRole(ctx, 1, "client")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "cannot demote")
	})
}

func TestAssignCurator(t *testing.T) {
	t.Run("successful assignment", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		// Verify client
		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(100)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("client"))

		// Verify curator
		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(10)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("coordinator"))

		// Deactivate old relationship
		mock.ExpectExec("UPDATE curator_client_relationships SET status").
			WithArgs(int64(100)).
			WillReturnResult(sqlmock.NewResult(0, 0))

		// Create new relationship
		mock.ExpectExec("INSERT INTO curator_client_relationships").
			WithArgs(int64(10), int64(100)).
			WillReturnResult(sqlmock.NewResult(1, 1))

		// Create conversation
		mock.ExpectExec("INSERT INTO conversations").
			WithArgs(int64(100), int64(10)).
			WillReturnResult(sqlmock.NewResult(1, 1))

		err := service.AssignCurator(ctx, 100, 10)
		assert.NoError(t, err)
	})

	t.Run("client not found", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(999)).
			WillReturnError(sql.ErrNoRows)

		err := service.AssignCurator(ctx, 999, 10)
		assert.Error(t, err)
		assert.Equal(t, "client not found", err.Error())
	})

	t.Run("curator not found", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(100)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("client"))

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(999)).
			WillReturnError(sql.ErrNoRows)

		err := service.AssignCurator(ctx, 100, 999)
		assert.Error(t, err)
		assert.Equal(t, "curator not found", err.Error())
	})

	t.Run("user is not a client", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(100)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("coordinator"))

		err := service.AssignCurator(ctx, 100, 10)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not a client")
	})

	t.Run("user is not a coordinator", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(100)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("client"))

		mock.ExpectQuery("SELECT role FROM users WHERE id").
			WithArgs(int64(10)).
			WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("client"))

		err := service.AssignCurator(ctx, 100, 10)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not a coordinator")
	})
}

func TestGetConversations(t *testing.T) {
	t.Run("returns conversation list", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		now := time.Now()
		rows := sqlmock.NewRows([]string{
			"id", "client_id", "client_name",
			"curator_id", "curator_name",
			"message_count", "updated_at",
		}).
			AddRow("conv-1", int64(100), "Client One", int64(10), "Curator One", 15, now).
			AddRow("conv-2", int64(200), "Client Two", int64(20), "Curator Two", 0, now)

		mock.ExpectQuery("SELECT c.id").WillReturnRows(rows)

		conversations, err := service.GetConversations(ctx)
		assert.NoError(t, err)
		require.Len(t, conversations, 2)

		assert.Equal(t, "conv-1", conversations[0].ID)
		assert.Equal(t, int64(100), conversations[0].ClientID)
		assert.Equal(t, "Client One", conversations[0].ClientName)
		assert.Equal(t, int64(10), conversations[0].CuratorID)
		assert.Equal(t, "Curator One", conversations[0].CuratorName)
		assert.Equal(t, 15, conversations[0].MessageCount)

		assert.Equal(t, "conv-2", conversations[1].ID)
		assert.Equal(t, 0, conversations[1].MessageCount)
	})

	t.Run("returns empty list when no conversations", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		rows := sqlmock.NewRows([]string{
			"id", "client_id", "client_name",
			"curator_id", "curator_name",
			"message_count", "updated_at",
		})
		mock.ExpectQuery("SELECT c.id").WillReturnRows(rows)

		conversations, err := service.GetConversations(ctx)
		assert.NoError(t, err)
		assert.NotNil(t, conversations)
		assert.Len(t, conversations, 0)
	})

	t.Run("returns error on query failure", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT c.id").WillReturnError(fmt.Errorf("db error"))

		conversations, err := service.GetConversations(ctx)
		assert.Error(t, err)
		assert.Nil(t, conversations)
		assert.Contains(t, err.Error(), "failed to query conversations")
	})
}

func TestGetConversationMessages(t *testing.T) {
	t.Run("returns messages without cursor", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		now := time.Now()
		content := "Hello!"

		// Check conversation exists
		mock.ExpectQuery("SELECT EXISTS").
			WithArgs("conv-1").
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		// Query messages
		rows := sqlmock.NewRows([]string{
			"id", "sender_id", "sender_name", "type", "content", "created_at",
		}).
			AddRow("msg-1", int64(100), "User One", "text", content, now).
			AddRow("msg-2", int64(10), "Curator One", "text", nil, now)

		mock.ExpectQuery("SELECT m.id").
			WithArgs("conv-1", 50).
			WillReturnRows(rows)

		messages, err := service.GetConversationMessages(ctx, "conv-1", "", 50)
		assert.NoError(t, err)
		require.Len(t, messages, 2)

		assert.Equal(t, "msg-1", messages[0].ID)
		assert.Equal(t, int64(100), messages[0].SenderID)
		assert.Equal(t, "User One", messages[0].SenderName)
		assert.Equal(t, "text", messages[0].Type)
		require.NotNil(t, messages[0].Content)
		assert.Equal(t, "Hello!", *messages[0].Content)

		assert.Equal(t, "msg-2", messages[1].ID)
		assert.Nil(t, messages[1].Content)
	})

	t.Run("returns messages with cursor", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		now := time.Now()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs("conv-1").
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		rows := sqlmock.NewRows([]string{
			"id", "sender_id", "sender_name", "type", "content", "created_at",
		}).
			AddRow("msg-3", int64(100), "User One", "text", "Older message", now)

		mock.ExpectQuery("SELECT m.id").
			WithArgs("conv-1", "cursor-msg-id", 50).
			WillReturnRows(rows)

		messages, err := service.GetConversationMessages(ctx, "conv-1", "cursor-msg-id", 50)
		assert.NoError(t, err)
		require.Len(t, messages, 1)
		assert.Equal(t, "msg-3", messages[0].ID)
	})

	t.Run("conversation not found", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs("nonexistent").
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

		messages, err := service.GetConversationMessages(ctx, "nonexistent", "", 50)
		assert.Error(t, err)
		assert.Equal(t, "conversation not found", err.Error())
		assert.Nil(t, messages)
	})

	t.Run("clamps limit", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs("conv-1").
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		rows := sqlmock.NewRows([]string{
			"id", "sender_id", "sender_name", "type", "content", "created_at",
		})
		// When limit > 100, it's clamped to 100
		mock.ExpectQuery("SELECT m.id").
			WithArgs("conv-1", 100).
			WillReturnRows(rows)

		messages, err := service.GetConversationMessages(ctx, "conv-1", "", 200)
		assert.NoError(t, err)
		assert.NotNil(t, messages)
	})

	t.Run("defaults limit when zero", func(t *testing.T) {
		service, mock, cleanup := setupTestService(t)
		defer cleanup()
		ctx := context.Background()

		mock.ExpectQuery("SELECT EXISTS").
			WithArgs("conv-1").
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

		rows := sqlmock.NewRows([]string{
			"id", "sender_id", "sender_name", "type", "content", "created_at",
		})
		mock.ExpectQuery("SELECT m.id").
			WithArgs("conv-1", 50).
			WillReturnRows(rows)

		messages, err := service.GetConversationMessages(ctx, "conv-1", "", 0)
		assert.NoError(t, err)
		assert.NotNil(t, messages)
	})
}
