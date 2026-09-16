package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recorder запоминает, какие методы позвали и с чем.
type recorder struct {
	mu      sync.Mutex
	methods []string
	bodies  []map[string]any
	answers map[string]string
}

func recording(t *testing.T, answers map[string]string) (*Client, *recorder) {
	t.Helper()
	rec := &recorder{answers: answers}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)

		rec.mu.Lock()
		defer rec.mu.Unlock()
		for method, answer := range rec.answers {
			if strings.HasSuffix(r.URL.Path, "/"+method) {
				rec.methods = append(rec.methods, method)
				rec.bodies = append(rec.bodies, body)
				_, _ = w.Write([]byte(answer))
				return
			}
		}
		_, _ = w.Write([]byte(`{"ok":false,"description":"метод не подготовлен"}`))
	}))
	t.Cleanup(server.Close)

	c := NewClient("токен")
	c.baseURL = server.URL
	return c, rec
}

// Ссылка создаётся заявочной, а не мгновенной: заявка — та точка, где бот
// сверяется с базой. Мгновенная означала бы, что любой, кому ссылка попала, уже
// внутри переписки с клиентами.
func TestInviteLinkCreatesAJoinRequest(t *testing.T) {
	c, rec := recording(t, map[string]string{
		"createChatInviteLink": `{"ok":true,"result":{"invite_link":"https://t.me/+ABC"}}`,
	})

	link, err := c.CreateInviteLink(context.Background(), -100, "Куратор Анна")

	require.NoError(t, err)
	assert.Equal(t, "https://t.me/+ABC", link.URL)
	require.Len(t, rec.bodies, 1)
	assert.Equal(t, true, rec.bodies[0]["creates_join_request"],
		"ссылка впускает без заявки — сверить роль будет негде")
	assert.Equal(t, "Куратор Анна", rec.bodies[0]["name"])
}

// Ссылка без ссылки бесполезна: показать в профиле будет нечего.
func TestInviteWithoutALinkIsAnError(t *testing.T) {
	c, _ := recording(t, map[string]string{
		"createChatInviteLink": `{"ok":true,"result":{}}`,
	})

	_, err := c.CreateInviteLink(context.Background(), -100, "имя")

	require.Error(t, err)
}

// Удаление обязано снимать бан следом.
//
// Иначе человек не сможет вернуться, и выяснится это в тот день, когда роль ему
// вернут — то есть позже всего, когда это можно было бы исправить дёшево.
func TestRemoveMemberLiftsTheBan(t *testing.T) {
	c, rec := recording(t, map[string]string{
		"banChatMember":   `{"ok":true,"result":true}`,
		"unbanChatMember": `{"ok":true,"result":true}`,
	})

	require.NoError(t, c.RemoveMember(context.Background(), -100, 42))

	assert.Equal(t, []string{"banChatMember", "unbanChatMember"}, rec.methods,
		"бан не снят — вернуть человека в группу будет нельзя")
	assert.Equal(t, false, rec.bodies[0]["revoke_messages"],
		"сообщения ушедшего куратора удалены — это рабочая запись, а не его личные данные")
}

// Бан прошёл, а снятие нет — человек удалён, но вернуться не сможет, и это надо
// сказать, а не проглотить.
func TestRemoveMemberReportsAStuckBan(t *testing.T) {
	c, _ := recording(t, map[string]string{
		"banChatMember":   `{"ok":true,"result":true}`,
		"unbanChatMember": `{"ok":false,"description":"not enough rights"}`,
	})

	err := c.RemoveMember(context.Background(), -100, 42)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "вернуться он не сможет")
}

// Отказ Telegram приходит с кодом 200 — и в одобрении заявки тоже.
func TestJoinRequestDecisionsReportRefusals(t *testing.T) {
	c, _ := recording(t, map[string]string{
		"approveChatJoinRequest": `{"ok":false,"description":"USER_ALREADY_PARTICIPANT"}`,
		"declineChatJoinRequest": `{"ok":true,"result":true}`,
	})

	require.Error(t, c.ApproveJoinRequest(context.Background(), -100, 1))
	require.NoError(t, c.DeclineJoinRequest(context.Background(), -100, 1))
}

func TestAdministratorsAreParsed(t *testing.T) {
	c, _ := recording(t, map[string]string{
		"getChatAdministrators": `{"ok":true,"result":[
			{"status":"creator","user":{"id":1,"username":"owner","is_bot":false}},
			{"status":"administrator","user":{"id":2,"username":"bot","is_bot":true}}]}`,
	})

	members, err := c.Administrators(context.Background(), -100)

	require.NoError(t, err)
	require.Len(t, members, 2)
	assert.True(t, members[0].IsOwner(), "владельца не опознали — бот попробует его удалить")
	assert.True(t, members[1].IsBot)
	assert.False(t, members[1].IsOwner())
}

// Состав недоступен — это отказ, а не пустая группа.
//
// Разница решающая: пустую группу сверка вычистила бы целиком.
func TestAdministratorsFailureIsNotAnEmptyGroup(t *testing.T) {
	c, _ := recording(t, map[string]string{
		"getChatAdministrators": `{"ok":false,"description":"chat not found"}`,
	})

	members, err := c.Administrators(context.Background(), -100)

	require.Error(t, err)
	assert.Nil(t, members)
}

func TestMemberStatusTellsWhoIsInside(t *testing.T) {
	for status, inside := range map[string]bool{
		"creator": true, "administrator": true, "member": true, "restricted": true,
		"left": false, "kicked": false,
	} {
		assert.Equal(t, inside, Member{Status: status}.InGroup(), "статус %q", status)
	}
}
