//go:build live

// Живые обращения к модели. Отдельный тег сборки, потому что каждый прогон —
// это оплаченные запросы: в CI они шли бы на каждый коммит и платили бы за то,
// что не меняется.
//
// Запуск:
//
//	LLM_API_KEY=… SUPPORT_MODEL=gpt://<folder>/yandexgpt/latest \
//		go test -tags=live ./internal/modules/support/ -run TestLive -v
//
// Компилируется в CI (`go vet -tags=live ./...`), но не запускается. Именно
// этого здесь не хватало: после переезда с OpenRouter на Yandex Foundation
// Models файл перестал собираться и молчал об этом, потому что собирать его
// было некому. Тест, который не компилируется, ничем не отличается от
// отсутствующего — только выглядит иначе.

package support

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/llm"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type usage struct {
	prompt, cached int
}

func liveClient(t *testing.T, seen *[]usage) *llm.Client {
	t.Helper()
	key := os.Getenv("LLM_API_KEY")
	if key == "" {
		key = os.Getenv("OPENROUTER_API_KEY") // прежнее имя, пока не везде убрано
	}
	if key == "" {
		t.Skip("нет LLM_API_KEY — живой прогон пропущен")
	}

	// Умолчания для модели нет намеренно: у Яндекса имя модели содержит
	// идентификатор каталога, и угадать его нельзя. Молча взять чужую модель
	// хуже, чем пропустить прогон.
	model := os.Getenv("SUPPORT_MODEL")
	if model == "" {
		t.Skip("нет SUPPORT_MODEL — живой прогон пропущен")
	}

	client := llm.NewClient(key, model, logger.New())
	if base := os.Getenv("LLM_BASE_URL"); base != "" {
		scheme := os.Getenv("LLM_AUTH_SCHEME")
		if scheme == "" {
			scheme = llm.DefaultAuthScheme
		}
		client = client.WithEndpoint(base, scheme)
	}

	return client.WithUsageObserver(func(prompt, cached int) {
		*seen = append(*seen, usage{prompt, cached})
	})
}

// Бот отправляет перед каждым вопросом всё руководство пользователя. Вопрос,
// на который отвечает этот прогон: действительно ли провайдер читает префикс из
// кэша, или мы платим за него каждый раз.
//
// Первый запрос кэш наполняет, второй должен из него читать. Разница между ними
// и есть ответ.
func TestLivePrefixIsCached(t *testing.T) {
	var seen []usage
	client := liveClient(t, &seen)

	prefix, err := buildPrefix()
	require.NoError(t, err)
	t.Logf("длина префикса: %d байт", len(prefix))

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	for i, question := range []string{"Как сбросить пароль?", "Как сбросить пароль?"} {
		answer, err := client.Ask(ctx, prefix, question, nil)
		require.NoError(t, err, "запрос %d", i+1)
		require.NotEmpty(t, answer)
		// Пауза: кэш провайдера записывается не мгновенно.
		if i == 0 {
			time.Sleep(5 * time.Second)
		}
	}

	require.Len(t, seen, 2, "оба запроса должны были сообщить расход")
	for i, u := range seen {
		share := 0.0
		if u.prompt > 0 {
			share = 100 * float64(u.cached) / float64(u.prompt)
		}
		t.Logf("запрос %d: отправлено %d, из кэша %d (%.1f%%)", i+1, u.prompt, u.cached, share)
	}

	assert.Greater(t, seen[1].cached, 0,
		"второй запрос ничего не прочитал из кэша — префикс либо не помечен, либо не байт-стабилен")
	assert.Greater(t, float64(seen[1].cached)/float64(seen[1].prompt), 0.5,
		"из кэша читается меньше половины: за корпус мы платим почти полностью")
}

// Контрольный набор из задачи 1.3, прогнанный по-настоящему.
//
// Покрытые вопросы должны быть отвечены по документации, непокрытые — получить
// маркер отказа. Второе важнее: именно граница компетенции отделяет полезного
// бота от того, который уверенно выдумывает про цены и здоровье.
func TestLiveControlQuestions(t *testing.T) {
	var seen []usage
	client := liveClient(t, &seen)

	set := loadControlQuestions(t)
	prefix, err := buildPrefix()
	require.NoError(t, err)

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Minute)
	defer cancel()

	var wrongAnswers, wrongRefusals []string

	for _, q := range set.Covered {
		answer, err := client.Ask(ctx, prefix, q.Question, nil)
		require.NoError(t, err, q.Question)
		if contains(answer, EscalationMarker) {
			wrongRefusals = append(wrongRefusals, q.Question+" → отказ, хотя ответ есть в документации")
			continue
		}
		for _, want := range q.Expect {
			if !containsFold(answer, want) {
				wrongAnswers = append(wrongAnswers,
					q.Question+" → в ответе нет «"+want+"»: "+trim(answer, 140))
			}
		}
	}

	for _, q := range set.Uncovered {
		answer, err := client.Ask(ctx, prefix, q.Question, nil)
		require.NoError(t, err, q.Question)
		if !contains(answer, EscalationMarker) {
			wrongAnswers = append(wrongAnswers,
				"ОТВЕТИЛ НА НЕПОКРЫТОЕ: "+q.Question+" → "+trim(answer, 200))
		}
	}

	for _, m := range wrongRefusals {
		t.Errorf("отказ там, где не надо: %s", m)
	}
	for _, m := range wrongAnswers {
		t.Errorf("%s", m)
	}

	t.Logf("вопросов: %d покрытых, %d непокрытых; обращений к модели: %d",
		len(set.Covered), len(set.Uncovered), len(seen))
}

func contains(haystack, needle string) bool {
	return strings.Contains(haystack, needle)
}

func containsFold(haystack, needle string) bool {
	return strings.Contains(strings.ToLower(haystack), strings.ToLower(needle))
}

// trim режет по рунам, а не по байтам: обрыв посреди многобайтового символа
// превратил бы сообщение об ошибке в мусор.
func trim(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
