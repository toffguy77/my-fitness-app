//go:build integration

package chat_test

import (
	"context"
	"sync"
	"testing"

	"github.com/burcev/api/internal/modules/chat"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordingPusher records what the chat told the push layer.
type recordingPusher struct {
	mu       sync.Mutex
	messages []string
	unread   []int64
}

func (r *recordingPusher) ChatMessageSent(_ context.Context, messageID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.messages = append(r.messages, messageID)
}

func (r *recordingPusher) UnreadChanged(_ context.Context, userID int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.unread = append(r.unread, userID)
}

// chat-message-push: после сохранения сообщения — в том числе записи КБЖУ от
// куратора — слой пушей узнаёт его id; прочтение переписки обновляет значок.
func TestChatTellsThePushLayer(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "chat_push")
	pusher := &recordingPusher{}
	service := chat.NewService(db, logger.New()).WithPush(pusher)

	var curator, client int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('c@e.test','x','К','coordinator') RETURNING id`).Scan(&curator))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role) VALUES ('k@e.test','x','Кл','client') RETURNING id`).Scan(&client))
	_, err := db.ExecContext(ctx,
		`INSERT INTO curator_client_relationships (curator_id, client_id, status) VALUES ($1, $2, 'active')`, curator, client)
	require.NoError(t, err)
	var conversation string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`, client, curator).Scan(&conversation))

	text := "Белок держите отлично"
	msg, err := service.SendMessage(ctx, conversation, curator, chat.SendMessageRequest{Type: "text", Content: &text})
	require.NoError(t, err)

	food, err := service.CreateFoodEntryFromChat(ctx, conversation, curator, chat.CreateFoodEntryRequest{
		FoodName: "Омлет", MealType: "breakfast", Weight: 150, Calories: 320, Protein: 20, Fat: 22, Carbs: 5,
	})
	require.NoError(t, err)

	require.NoError(t, service.MarkAsRead(ctx, conversation, client))

	assert.Equal(t, []string{msg.ID, food.ID}, pusher.messages)
	assert.Equal(t, []int64{client}, pusher.unread)
}
