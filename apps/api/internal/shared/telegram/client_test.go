package telegram

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Without a token there is no bot, and a client that pretends otherwise would
// fail on every send instead of at configuration time.
func TestNewClient_NoTokenNoClient(t *testing.T) {
	assert.Nil(t, NewClient(""))
	assert.NotNil(t, NewClient("token"))
}

func TestSendMessage_PostsToTheChat(t *testing.T) {
	var body map[string]any
	var path string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		payload, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(payload, &body)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	client := NewClient("bot-token")
	client.baseURL = server.URL

	require.NoError(t, client.SendMessage(context.Background(), 555, "ответ"))

	assert.Equal(t, "/botbot-token/sendMessage", path)
	assert.Equal(t, float64(555), body["chat_id"])
	assert.Equal(t, "ответ", body["text"])
}

func TestSendMessage_ReportsARefusal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"ok":false,"description":"bot was blocked by the user"}`))
	}))
	defer server.Close()

	client := NewClient("bot-token")
	client.baseURL = server.URL

	err := client.SendMessage(context.Background(), 555, "ответ")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "blocked")
}

func TestUpdate_ParsesWhatTheBotActsOn(t *testing.T) {
	raw := `{"update_id":7,"message":{"message_id":3,"from":{"id":9,"username":"guest","first_name":"Гость"},"chat":{"id":555},"text":"привет"}}`

	var update Update
	require.NoError(t, json.Unmarshal([]byte(raw), &update))

	require.NotNil(t, update.Message)
	assert.Equal(t, int64(555), update.Message.Chat.ID)
	assert.Equal(t, "привет", update.Message.Text)
	require.NotNil(t, update.Message.From)
	assert.Equal(t, "guest", update.Message.From.Username)
}

// Joins, stickers and photographs arrive on the same webhook and have nothing
// to answer.
func TestUpdate_TextlessUpdatesParseWithoutAMessage(t *testing.T) {
	var update Update
	require.NoError(t, json.Unmarshal([]byte(`{"update_id":8}`), &update))

	assert.Nil(t, update.Message)
}
