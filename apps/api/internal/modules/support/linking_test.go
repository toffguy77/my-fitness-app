package support

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
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

type stubGreeter struct {
	curator bool
	err     error
	calls   int
	seen    int64
}

func (g *stubGreeter) OnTelegramLinked(_ context.Context, userID int64) (bool, error) {
	g.calls++
	g.seen = userID
	return g.curator, g.err
}

// Обычный человек получает ссылку на руководство, куратор — нет.
//
// Куратору своё приглашение присылает тот, кто ведёт состав рабочей группы, и
// в нём кураторское руководство. Руководство клиента — про дневник питания и
// общение с куратором — тому, кто сам куратор, не про него.
func TestLinkedReplyCarriesTheRightGuide(t *testing.T) {
	for _, c := range []struct {
		имя     string
		curator bool
		ждём    bool
	}{
		{"обычный человек", false, true},
		{"куратор", true, false},
	} {
		t.Run(c.имя, func(t *testing.T) {
			sender := &countingSender{}
			greeter := &stubGreeter{curator: c.curator}
			service := NewService(nil, logger.New(), nil, sender, nil, 100).
				WithLinks(&stubLinks{accept: "НАШБИЛЕТ"}).
				WithLinkedGreeter(greeter)

			done, err := service.redeemLink(context.Background(),
				IncomingMessage{ChatID: 555}, "НАШБИЛЕТ")

			require.NoError(t, err)
			assert.True(t, done)
			assert.Equal(t, int64(42), greeter.seen, "приветствию достался не тот человек")
			require.Len(t, sender.sent, 1)
			assert.Contains(t, sender.sent[0], "подключён")
			if c.ждём {
				assert.Contains(t, sender.sent[0], UserGuideURL)
			} else {
				assert.NotContains(t, sender.sent[0], UserGuideURL)
			}
		})
	}
}

// Отказ приветствия не отменяет привязку.
//
// Она уже записана — молчать в ответ на удачный `/start` значит показать
// человеку сбой там, где его нет. Ссылка при этом уходит: не зная, куратор
// перед нами или нет, безопаснее дать руководство клиента, чем ничего.
func TestGreeterFailureStillAnswers(t *testing.T) {
	sender := &countingSender{}
	greeter := &stubGreeter{err: fmt.Errorf("группа недоступна")}
	service := NewService(nil, logger.New(), nil, sender, nil, 100).
		WithLinks(&stubLinks{accept: "НАШБИЛЕТ"}).
		WithLinkedGreeter(greeter)

	done, err := service.redeemLink(context.Background(),
		IncomingMessage{ChatID: 555}, "НАШБИЛЕТ")

	require.NoError(t, err)
	assert.True(t, done)
	require.Len(t, sender.sent, 1)
	assert.Contains(t, sender.sent[0], "подключён")
}

// Ссылка на руководство ведёт в существующий файл.
//
// Её отправляют живому человеку, и проверить её может только тот, кто её
// получил: переименование файла в репозитории сломает ссылку молча, а узнает
// об этом первый же зарегистрировавшийся, открыв страницу «404» вместо
// «с чего начать». Дешевле спросить у файловой системы здесь.
func TestUserGuideURLPointsAtAFileThatExists(t *testing.T) {
	assertGuideURLResolves(t, UserGuideURL)
}

func assertGuideURLResolves(t *testing.T, raw string) {
	t.Helper()

	const prefix = "https://github.com/toffguy77/my-fitness-app/blob/main/"
	require.True(t, strings.HasPrefix(raw, prefix), "ссылка ведёт не в этот репозиторий: %s", raw)

	decoded, err := url.PathUnescape(strings.TrimPrefix(raw, prefix))
	require.NoError(t, err)

	// Пять уровней вверх: internal/modules/<модуль> внутри apps/api.
	path := filepath.Join("..", "..", "..", "..", "..", filepath.FromSlash(decoded))
	_, err = os.Stat(path)
	require.NoError(t, err, "файл руководства не найден: %s", decoded)
}
