package recipes

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recorded is a real answer of mcp.vkusvill.ru to vkusvill_recipes for
// «сырники», recorded 2026-10-10.
func recorded(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	require.NoError(t, err)
	return data
}

// replayServer answers every call with body and records the last request.
func replayServer(t *testing.T, status int, contentType string, body []byte) (*httptest.Server, *atomic.Pointer[map[string]any], *atomic.Pointer[http.Header]) {
	t.Helper()
	var lastBody atomic.Pointer[map[string]any]
	var lastHeader atomic.Pointer[http.Header]
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var decoded map[string]any
		_ = json.Unmarshal(raw, &decoded)
		lastBody.Store(&decoded)
		h := r.Header.Clone()
		lastHeader.Store(&h)
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv, &lastBody, &lastHeader
}

func TestVkusvillSearchParsesRecordedAnswer(t *testing.T) {
	srv, lastBody, lastHeader := replayServer(t, http.StatusOK, "application/json",
		recorded(t, "vkusvill_recipes_syrniki.json"))

	page, err := NewVkusvillClient(srv.URL).Search(context.Background(), "сырники", 1)
	require.NoError(t, err)

	assert.Equal(t, 17, page.Total)
	assert.True(t, page.HasMore)
	require.Len(t, page.Items, 10)

	first := page.Items[0]
	assert.Equal(t, int64(5776208), first.ID)
	assert.Equal(t, "Пирожки с яйцом и творогом", first.Name)
	assert.Equal(t, 2, first.Portions)
	assert.Contains(t, first.Image, "vkusvill.ru/upload/")
	require.Len(t, first.Ingredients, 7)
	assert.Equal(t, "Творог высокобелковый", first.Ingredients[0].Name)
	assert.Equal(t, "200 г", *first.Ingredients[0].Quantity)
	require.Len(t, first.Steps, 4)
	assert.NotNil(t, first.Steps[0].Image)

	assert.Equal(t, "easy", MapComplexity(first.Complexity))
	assert.Equal(t, 40, MapCookMinutes(first.CookingTime))
	assert.Equal(t, []string{"breakfast"}, MapMealTypes(first.Sections))
	assert.Equal(t, []string{"gluten", "lactose", "eggs"}, MapAllergens(first.Allergens))

	// The tool refuses a call missing any argument (see the second recording),
	// so every one of them has to be sent.
	body := *lastBody.Load()
	assert.Equal(t, "tools/call", body["method"])
	params := body["params"].(map[string]any)
	assert.Equal(t, "vkusvill_recipes", params["name"])
	args := params["arguments"].(map[string]any)
	for _, k := range []string{"q", "page", "sort", "id_feature_filter", "id_cooking_time_filter",
		"id_cooking_method_filter", "id_complexity_filter", "id_category_filter", "id_exclude_allergens_filter"} {
		assert.Contains(t, args, k)
	}
	assert.Equal(t, "popularity", args["sort"])
	header := *lastHeader.Load()
	assert.Equal(t, "application/json", header.Get("Content-Type"))
	assert.Equal(t, "application/json, text/event-stream", header.Get("Accept"))
}

// A heading line of the ingredient list («<b>Для подачи:</b>», quantity null)
// is not an ingredient.
func TestVkusvillSectionHeadingsAreNotIngredients(t *testing.T) {
	srv, _, _ := replayServer(t, http.StatusOK, "application/json", recorded(t, "vkusvill_recipes_syrniki.json"))
	page, err := NewVkusvillClient(srv.URL).Search(context.Background(), "сырники", 1)
	require.NoError(t, err)

	ricotta := page.Items[1]
	require.Equal(t, "Сырники из рикотты", ricotta.Name)
	headings := 0
	for _, ing := range ricotta.Ingredients {
		if isSectionHeading(ing) {
			headings++
			assert.Contains(t, ing.Name, "Для подачи")
		}
	}
	assert.Equal(t, 1, headings)
}

func TestVkusvillStreamAnswerIsRead(t *testing.T) {
	body := append([]byte("event: message\ndata: "), recorded(t, "vkusvill_recipes_syrniki.json")...)
	body = append(body, '\n', '\n')
	srv, _, _ := replayServer(t, http.StatusOK, "text/event-stream", body)

	page, err := NewVkusvillClient(srv.URL).Search(context.Background(), "сырники", 1)
	require.NoError(t, err)
	assert.Len(t, page.Items, 10)
}

// Сценарий «ВкусВилл недоступен»: любая форма отказа — ErrUpstream.
func TestVkusvillFailuresAreUpstreamErrors(t *testing.T) {
	okFalse := `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"ok\":false}"}]}}`
	cases := []struct {
		name   string
		status int
		body   []byte
	}{
		{"http error", http.StatusServiceUnavailable, []byte("down")},
		{"json-rpc error (recorded)", http.StatusOK, recorded(t, "vkusvill_error_missing_sort.json")},
		{"tool says ok false", http.StatusOK, []byte(okFalse)},
		{"garbage", http.StatusOK, []byte("<html>")},
		{"empty result", http.StatusOK, []byte(`{"jsonrpc":"2.0","id":1,"result":{"content":[]}}`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, _, _ := replayServer(t, tc.status, "application/json", tc.body)
			_, err := NewVkusvillClient(srv.URL).Search(context.Background(), "сырники", 1)
			assert.True(t, errors.Is(err, ErrUpstream), "got %v", err)
		})
	}

	t.Run("unreachable", func(t *testing.T) {
		srv := httptest.NewServer(http.NotFoundHandler())
		url := srv.URL
		srv.Close()
		_, err := NewVkusvillClient(url).Search(context.Background(), "сырники", 1)
		assert.True(t, errors.Is(err, ErrUpstream), "got %v", err)
	})
}

func TestMinuteLimiterWaitsOnceTheMinuteIsSpent(t *testing.T) {
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	l := newMinuteLimiter(2)
	l.now = func() time.Time { return now }

	require.NoError(t, l.Wait(context.Background()))
	require.NoError(t, l.Wait(context.Background()))

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	assert.ErrorIs(t, l.Wait(ctx), context.DeadlineExceeded, "third call within the minute must wait")

	now = now.Add(61 * time.Second)
	assert.NoError(t, l.Wait(context.Background()), "a minute later the window is free again")
}

func TestRecipeCacheExpires(t *testing.T) {
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	c := newRecipeCache(time.Minute)
	c.now = func() time.Time { return now }
	c.put([]VkusvillRecipe{{ID: 42, Name: "Суп"}})

	got, ok := c.get("42")
	require.True(t, ok)
	assert.Equal(t, "Суп", got.Name)

	now = now.Add(2 * time.Minute)
	_, ok = c.get("42")
	assert.False(t, ok)
}

func TestVkusvillMappings(t *testing.T) {
	assert.Equal(t, "medium", MapComplexity(&vkusvillNamed{Name: "Средний"}))
	assert.Equal(t, "hard", MapComplexity(&vkusvillNamed{Name: "Профи"}))
	assert.Equal(t, "easy", MapComplexity(nil))

	for name, minutes := range map[string]int{
		"до 20 минут": 20, "до 40 минут": 40, "до 1 часа": 60, "1-2 часа": 120, "более 2 часов": 180,
	} {
		assert.Equal(t, minutes, MapCookMinutes(&vkusvillNamed{Name: name}), name)
	}

	assert.Equal(t, []string{"lunch", "dinner"}, MapMealTypes(nil), "no meal section means lunch and dinner")
	assert.Equal(t, []string{"breakfast", "dinner", "snack"}, MapMealTypes([]vkusvillNamed{
		{Name: "Перекус"}, {Name: "На ужин"}, {Name: "Закуски"}, {Name: "На завтрак"},
	}))

	assert.Equal(t, []string{"nuts", "gluten", "lactose", "eggs", "sesame", "mustard"}, MapAllergens([]vkusvillNamed{
		{Name: "Горчица"}, {Name: "Кунжут"}, {Name: "Яйца"}, {Name: "Лактоза"}, {Name: "Глютен"},
		{Name: "Орехи"}, {Name: "Лук"}, {Name: "Сахар"}, {Name: "Цитрусовые"},
	}), "Лук, Сахар and anything unknown are dropped")
}

// Фото копируются только с vkusvill.ru: адрес приходит в чужом ответе.
func TestFetchVkusvillImageRefusesOtherHosts(t *testing.T) {
	for _, url := range []string{
		"http://vkusvill.ru/a.webp",
		"https://evil.example/a.webp",
		"https://vkusvill.ru.evil.example/a.webp",
		"https://169.254.169.254/latest",
		"not a url",
	} {
		_, err := fetchVkusvillImage(context.Background(), url)
		assert.True(t, errors.Is(err, ErrUpstream), url)
	}
}

// Сторож SSRF: редирект с vkusvill.ru не должен уводить сервер на другой хост.
func TestImageClientRefusesRedirectOffVkusvill(t *testing.T) {
	check := imageClient.CheckRedirect
	req := func(raw string) *http.Request {
		u, err := url.Parse(raw)
		require.NoError(t, err)
		return &http.Request{URL: u}
	}
	first := []*http.Request{req("https://img.vkusvill.ru/a.webp")}

	assert.NoError(t, check(req("https://vkusvill.ru/upload/b.webp"), first))
	assert.Error(t, check(req("http://169.254.169.254/latest/meta-data"), first))
	assert.Error(t, check(req("https://burcev-dev-api/internal"), first))
	assert.Error(t, check(req("http://vkusvill.ru/plain-http.webp"), first))
	assert.Error(t, check(req("https://vkusvill.ru.evil.example/x.webp"), first))
	assert.Error(t, check(req("https://vkusvill.ru/x.webp"), append(first, first[0], first[0])))
}

// Тексты шагов ВкусВилла приходят с экранированной разметкой; до исправления
// клиент видел в карточке рецепта «&lt;p&gt;Подавайте…&lt;/p&gt;».
func TestCleanTextDecodesEscapedMarkup(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{"&lt;p&gt; Подавайте с ложкой страчателлы.&lt;/p&gt;\r\n\r\n&lt;p&gt; Совет: остудите вафли.&lt;/p&gt;",
			"Подавайте с ложкой страчателлы.\n\nСовет: остудите вафли."},
		{"&lt;p&gt;Шаг один.&lt;/p&gt;&lt;p&gt;Шаг два.&lt;/p&gt;", "Шаг один.\n\nШаг два."},
		{"Творог 9%, 400&nbsp;г", "Творог 9%, 400 г"},
		{"&amp;lt;b&amp;gt;Для начинки:&amp;lt;/b&amp;gt;", "Для начинки:"},
		{"Строка<br>ещё строка", "Строка\n\nещё строка"},
		{"<b>Жирный</b> текст", "Жирный текст"},
		{"Обычный текст без разметки", "Обычный текст без разметки"},
		{"Соль &amp; перец", "Соль & перец"},
	} {
		assert.Equal(t, c.want, cleanText(c.in), c.in)
	}
}

func TestEscapedSectionHeadingIsNotAnIngredient(t *testing.T) {
	q := "1 шт."
	assert.True(t, isSectionHeading(VkusvillIngr{Name: "&lt;b&gt;Для подачи:&lt;/b&gt;", Quantity: &q}))
	assert.False(t, isSectionHeading(VkusvillIngr{Name: "Соль &amp; перец", Quantity: &q}))
}
