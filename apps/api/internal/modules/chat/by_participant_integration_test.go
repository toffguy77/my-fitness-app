//go:build integration

package chat_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/chat"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// GET /conversations/by-participant/:userId — на настоящей базе: условие
// «вызывающий участвует» живёт в самом запросе, и подмена согласилась бы с
// любым запросом.
func TestGetConversationByParticipant(t *testing.T) {
	ctx := context.Background()
	db := testsupport.SchemaWithMigrations(t, "chat_by_participant")
	log := logger.New()
	service := chat.NewService(db, log)
	handler := chat.NewHandler(&config.Config{}, log, db, service, nil, nil)

	user := func(email, role string) int64 {
		t.Helper()
		var id int64
		require.NoError(t, db.QueryRowContext(ctx,
			`INSERT INTO users (email, password, name, role, email_verified)
			 VALUES ($1, 'x', $1, $2, true) RETURNING id`, email, role).Scan(&id))
		return id
	}
	curatorID := user("curator@example.test", "coordinator")
	clientA := user("a@example.test", "client")
	clientB := user("b@example.test", "client")

	var conversationID string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`,
		clientA, curatorID).Scan(&conversationID))
	// Переписка B с тем же куратором — чтобы у «чужой пары» было что найти,
	// если бы запрос не учитывал вызывающего.
	_, err := db.ExecContext(ctx,
		`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2)`, clientB, curatorID)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO messages (conversation_id, sender_id, type, content) VALUES ($1, $2, 'text', 'Здравствуйте')`,
		conversationID, clientA)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	request := func(callerID, otherID any) (*httptest.ResponseRecorder, map[string]any) {
		t.Helper()
		engine := gin.New()
		engine.GET("/conversations/by-participant/:userId", func(c *gin.Context) {
			c.Set("user_id", callerID)
			handler.GetConversationWith(c)
		})
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet,
			fmt.Sprintf("/conversations/by-participant/%v", otherID), nil))
		var body map[string]any
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
		return w, body
	}

	t.Run("куратор и его клиент", func(t *testing.T) {
		w, body := request(curatorID, clientA)

		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		data := body["data"].(map[string]any)
		assert.Equal(t, conversationID, data["id"])
		assert.EqualValues(t, clientA, data["client_id"])
		assert.EqualValues(t, curatorID, data["curator_id"])
		participant := data["participant"].(map[string]any)
		assert.EqualValues(t, clientA, participant["id"], "участник — клиент, а не сам куратор")
		assert.EqualValues(t, 1, data["unread_count"], "непрочитанное сообщение клиента")
		assert.NotNil(t, data["last_message"])

		// Тот же вид, что элемент GET /conversations.
		list, err := service.GetConversations(ctx, curatorID)
		require.NoError(t, err)
		var element map[string]any
		for _, conv := range list {
			if conv.ID == conversationID {
				raw, err := json.Marshal(conv)
				require.NoError(t, err)
				require.NoError(t, json.Unmarshal(raw, &element))
			}
		}
		require.NotNil(t, element)
		assert.Equal(t, element, data)
	})

	t.Run("клиент со своим куратором", func(t *testing.T) {
		w, body := request(clientA, curatorID)

		require.Equal(t, http.StatusOK, w.Code)
		data := body["data"].(map[string]any)
		assert.Equal(t, conversationID, data["id"])
		assert.EqualValues(t, curatorID, data["participant"].(map[string]any)["id"])
	})

	t.Run("чужая пара", func(t *testing.T) {
		w, body := request(clientA, clientB)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assert.Equal(t, "not_found", body["code"])
	})

	t.Run("переписки нет", func(t *testing.T) {
		w, body := request(clientB, clientA)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assert.Equal(t, "not_found", body["code"])
	})

	t.Run("не число вместо id", func(t *testing.T) {
		w, body := request(curatorID, "abc")

		assert.Equal(t, http.StatusNotFound, w.Code)
		assert.Equal(t, "not_found", body["code"])
	})
}
