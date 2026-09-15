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

	_, err := c.SendToTopic(context.Background(), -100, 0, "текст")
	require.NoError(t, err)

	_, present := got["message_thread_id"]
	assert.False(t, present, "нулевая тема уехала в Telegram как идентификатор")
}

// Недоступный Telegram — это отказ проверки, а не «группа в порядке».
func TestCheckForumReportsEachFailure(t *testing.T) {
	for name, bodies := range map[string]map[string]string{
		"getChat отказал": {
			"getChat": `{"ok":false,"description":"chat not found"}`,
		},
		"getMe отказал": {
			"getChat": `{"ok":true,"result":{"is_forum":true}}`,
			"getMe":   `{"ok":false,"description":"unauthorized"}`,
		},
		"getChatMember отказал": {
			"getChat":       `{"ok":true,"result":{"is_forum":true}}`,
			"getMe":         `{"ok":true,"result":{"id":1}}`,
			"getChatMember": `{"ok":false,"description":"user not found"}`,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := answering(t, bodies).CheckForum(context.Background(), -100)
			require.Error(t, err, "отказ Telegram принят за исправную группу")
		})
	}
}

// Закрытие темы тоже отвечает кодом 200 на отказ.
func TestCloseForumTopicReportsARefusal(t *testing.T) {
	c := answering(t, map[string]string{
		"closeForumTopic": `{"ok":false,"description":"topic not found"}`,
	})

	err := c.CloseForumTopic(context.Background(), -100, 7)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "topic not found")
}

func TestCloseForumTopicSucceeds(t *testing.T) {
	c := answering(t, map[string]string{"closeForumTopic": `{"ok":true,"result":true}`})
	assert.NoError(t, c.CloseForumTopic(context.Background(), -100, 7))
}
