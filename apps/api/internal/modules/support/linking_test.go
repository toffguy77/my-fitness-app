package support

import (
	"context"
	"fmt"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubLinks struct {
	accept string
	calls  int
}

func (s *stubLinks) Redeem(_ context.Context, ticket string, _ int64, _ string) (int64, error) {
	s.calls++
	if ticket == s.accept {
		return 42, nil
	}
	return 0, fmt.Errorf("не наш билет")
}

type countingSender struct{ sent []string }

func (c *countingSender) SendMessage(_ context.Context, _ int64, text string) error {
	c.sent = append(c.sent, text)
	return nil
}

func TestStartPayload(t *testing.T) {
	for text, want := range map[string]string{
		"/start БИЛЕТ":     "БИЛЕТ",
		"  /start БИЛЕТ  ": "БИЛЕТ",
		"/start":           "",
		"/start   ":        "",
		"привет":           "",
	} {
		got, ok := startPayload(text)
		assert.Equal(t, want, got, "для %q", text)
		assert.Equal(t, want != "", ok, "для %q", text)
	}
}

// Привязка не заводит обращение, не зовёт модель и не тратит лимит.
//
// Иначе человек, нажавший «Подключить Telegram» в профиле, заводил бы себе
// обращение в поддержку и получал ответ бота на свой билет.
func TestLinkingDoesNotBecomeASupportRequest(t *testing.T) {
	answerer := &fakeAnswerer{answer: "не должно быть вызвано"}
	sender := &countingSender{}
	links := &stubLinks{accept: "НАШБИЛЕТ"}
	// База не подключена намеренно: если код полезет в неё за обращением,
	// тест упадёт — а он не должен туда лезть.
	service := NewService(nil, logger.New(), answerer, sender, nil, 100).WithLinks(links)

	err := service.HandleMessage(context.Background(), IncomingMessage{
		ChatID: 555, Text: "/start НАШБИЛЕТ", Username: "ivanov",
	})

	require.NoError(t, err)
	assert.Zero(t, answerer.calls, "модель вызвали ради привязки")
	require.Len(t, sender.sent, 1)
	assert.Contains(t, sender.sent[0], "подключён")
}

// Чужой билет отдаётся дальше: это может быть ссылка «продолжить регистрацию».
//
// Проверяется признак «обработано», а не поход по остальному пути: путь требует
// базы, а вопрос здесь ровно один — не проглотила ли привязка чужой билет.
func TestForeignTicketIsNotSwallowed(t *testing.T) {
	sender := &countingSender{}
	links := &stubLinks{accept: "НАШБИЛЕТ"}
	service := NewService(nil, logger.New(), nil, sender, nil, 100).WithLinks(links)

	done, err := service.redeemLink(context.Background(),
		IncomingMessage{ChatID: 555, Text: "/start ЧУЖОЙ"}, "ЧУЖОЙ")

	require.NoError(t, err)
	assert.False(t, done, "чужой билет проглотили вместо того, чтобы отдать дальше")
	assert.Empty(t, sender.sent, "на чужой билет ответили как на привязку")
	assert.Equal(t, 1, links.calls)
}

// Наш билет обрабатывается и дальше не идёт.
func TestOurTicketIsHandledHere(t *testing.T) {
	sender := &countingSender{}
	links := &stubLinks{accept: "НАШБИЛЕТ"}
	service := NewService(nil, logger.New(), nil, sender, nil, 100).WithLinks(links)

	done, err := service.redeemLink(context.Background(),
		IncomingMessage{ChatID: 555}, "НАШБИЛЕТ")

	require.NoError(t, err)
	assert.True(t, done)
	require.Len(t, sender.sent, 1)
	assert.Contains(t, sender.sent[0], "подключён")
}
