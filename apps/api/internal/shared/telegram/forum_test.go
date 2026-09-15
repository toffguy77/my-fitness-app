package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// answering отвечает на каждый метод Bot API заготовленным телом.
func answering(t *testing.T, bodies map[string]string) *Client {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for method, body := range bodies {
			if len(r.URL.Path) >= len(method) && r.URL.Path[len(r.URL.Path)-len(method):] == method {
				_, _ = w.Write([]byte(body))
				return
			}
		}
		_, _ = w.Write([]byte(`{"ok":false,"description":"метод не подготовлен"}`))
	}))
	t.Cleanup(server.Close)

	c := NewClient("токен")
	c.baseURL = server.URL
	return c
}

// Отказ Telegram приходит с кодом 200.
//
// Самая дорогая ошибка при работе с этим API: смотреть на код состояния. «У
// бота нет прав управлять темами» — это двухсотка с ok:false, и принятая за
// успех она означает переписку, которая никуда не идёт.
func TestRefusalArrivesWithTwoHundred(t *testing.T) {
	c := answering(t, map[string]string{
		"createForumTopic": `{"ok":false,"description":"not enough rights to manage topics"}`,
	})

	_, err := c.CreateForumTopic(context.Background(), -100, "Анна К.")

	require.Error(t, err, "отказ с кодом 200 принят за успех")
	assert.Contains(t, err.Error(), "not enough rights")
}

func TestCreateForumTopicReturnsItsID(t *testing.T) {
	c := answering(t, map[string]string{
		"createForumTopic": `{"ok":true,"result":{"message_thread_id":4242,"name":"Анна К."}}`,
	})

	id, err := c.CreateForumTopic(context.Background(), -100, "Анна К.")

	require.NoError(t, err)
	assert.Equal(t, int64(4242), id)
}

// Тема без идентификатора бесполезна: писать в неё потом будет некуда.
func TestCreatedTopicWithoutAnIDIsAnError(t *testing.T) {
	c := answering(t, map[string]string{
		"createForumTopic": `{"ok":true,"result":{"name":"Анна К."}}`,
	})

	_, err := c.CreateForumTopic(context.Background(), -100, "Анна К.")

	require.Error(t, err)
}

// Группа годна, только если она форум И бот в ней администратор с правом на
// темы. Любого из трёх мало.
func TestForumIsUsableOnlyWhenAllThreeHold(t *testing.T) {
	cases := map[string]struct {
		chat, member string
		usable       bool
	}{
		"всё на месте": {
			`{"ok":true,"result":{"is_forum":true}}`,
			`{"ok":true,"result":{"status":"administrator","can_manage_topics":true}}`,
			true,
		},
		"темы выключены": {
			`{"ok":true,"result":{"is_forum":false}}`,
			`{"ok":true,"result":{"status":"administrator","can_manage_topics":true}}`,
			false,
		},
		"бот не администратор": {
			`{"ok":true,"result":{"is_forum":true}}`,
			`{"ok":true,"result":{"status":"member"}}`,
			false,
		},
		"администратор без права на темы": {
			`{"ok":true,"result":{"is_forum":true}}`,
			`{"ok":true,"result":{"status":"administrator","can_manage_topics":false}}`,
			false,
		},
	}

	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			client := answering(t, map[string]string{
				"getChat":       c.chat,
				"getMe":         `{"ok":true,"result":{"id":777}}`,
				"getChatMember": c.member,
			})

			state, err := client.CheckForum(context.Background(), -100)

			require.NoError(t, err)
			assert.Equal(t, c.usable, state.Usable())
		})
	}
}

// Сообщение без темы уходит в общую ленту, а не с нулевым message_thread_id:
// Telegram такой идентификатор не принимает.
func TestMessageWithoutATopicOmitsTheField(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"ok":true,"result":{}}`))
	}))
	defer server.Close()
	c := NewClient("токен")
	c.baseURL = server.URL

	require.NoError(t, c.SendToTopic(context.Background(), -100, 0, "текст"))

	_, present := got["message_thread_id"]
	assert.False(t, present, "нулевая тема уехала в Telegram как идентификатор")
}
