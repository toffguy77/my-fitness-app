package llm

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestClient(serverURL string) *Client {
	log := logger.New()
	c := NewClient("test-api-key", "test-model", log)
	c.baseURL = serverURL
	return c
}

func TestRecognizeFood_Success(t *testing.T) {
	response := chatResponse{
		Choices: []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		}{
			{Message: struct {
				Content string `json:"content"`
			}{
				Content: `{"items": [{"name": "Гречка", "estimated_weight_grams": 200, "calories_per_100": 313, "protein_per_100": 12.6, "fat_per_100": 3.3, "carbs_per_100": 62.1, "confidence": 0.92}]}`,
			}},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		// Схема по умолчанию — Api-Key: у нынешнего провайдера она такая, а
		// `Bearer` остаётся доступен через WithEndpoint для OpenAI-совместимых.
		assert.Equal(t, DefaultAuthScheme+" test-api-key", r.Header.Get("Authorization"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		defer r.Body.Close()

		var req chatRequest
		require.NoError(t, json.Unmarshal(body, &req))
		assert.Equal(t, "test-model", req.Model)
		assert.Len(t, req.Messages, 1)
		assert.Equal(t, "user", req.Messages[0].Role)
		assert.Len(t, req.Messages[0].Content, 2)
		assert.Equal(t, "text", req.Messages[0].Content[0].Type)
		assert.Equal(t, "image_url", req.Messages[0].Content[1].Type)
		assert.True(t, strings.HasPrefix(req.Messages[0].Content[1].ImageURL.URL, "data:image/jpeg;base64,"))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	result, err := client.RecognizeFood(context.Background(), []byte("fake-image-data"), "image/jpeg")

	require.NoError(t, err)
	require.Len(t, result.Items, 1)
	assert.Equal(t, "Гречка", result.Items[0].Name)
	assert.Equal(t, 200.0, result.Items[0].EstimatedWeight)
	assert.Equal(t, 313.0, result.Items[0].CaloriesPer100)
	assert.Equal(t, 12.6, result.Items[0].ProteinPer100)
	assert.Equal(t, 3.3, result.Items[0].FatPer100)
	assert.Equal(t, 62.1, result.Items[0].CarbsPer100)
	assert.Equal(t, 0.92, result.Items[0].Confidence)
}

func TestRecognizeFood_MultipleItems(t *testing.T) {
	response := chatResponse{
		Choices: []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		}{
			{Message: struct {
				Content string `json:"content"`
			}{
				Content: `{"items": [
					{"name": "Рис", "estimated_weight_grams": 150, "calories_per_100": 130, "protein_per_100": 2.7, "fat_per_100": 0.3, "carbs_per_100": 28, "confidence": 0.95},
					{"name": "Куриная грудка", "estimated_weight_grams": 120, "calories_per_100": 165, "protein_per_100": 31, "fat_per_100": 3.6, "carbs_per_100": 0, "confidence": 0.88}
				]}`,
			}},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	result, err := client.RecognizeFood(context.Background(), []byte("fake"), "image/jpeg")

	require.NoError(t, err)
	require.Len(t, result.Items, 2)
	assert.Equal(t, "Рис", result.Items[0].Name)
	assert.Equal(t, "Куриная грудка", result.Items[1].Name)
}

func TestRecognizeFood_MarkdownCodeFences(t *testing.T) {
	tests := []struct {
		name    string
		content string
	}{
		{
			name:    "with json code fence",
			content: "```json\n{\"items\": [{\"name\": \"Яблоко\", \"estimated_weight_grams\": 180, \"calories_per_100\": 52, \"protein_per_100\": 0.3, \"fat_per_100\": 0.2, \"carbs_per_100\": 14, \"confidence\": 0.95}]}\n```",
		},
		{
			name:    "with plain code fence",
			content: "```\n{\"items\": [{\"name\": \"Яблоко\", \"estimated_weight_grams\": 180, \"calories_per_100\": 52, \"protein_per_100\": 0.3, \"fat_per_100\": 0.2, \"carbs_per_100\": 14, \"confidence\": 0.95}]}\n```",
		},
		{
			name:    "raw json",
			content: "{\"items\": [{\"name\": \"Яблоко\", \"estimated_weight_grams\": 180, \"calories_per_100\": 52, \"protein_per_100\": 0.3, \"fat_per_100\": 0.2, \"carbs_per_100\": 14, \"confidence\": 0.95}]}",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := chatResponse{
				Choices: []struct {
					Message struct {
						Content string `json:"content"`
					} `json:"message"`
				}{
					{Message: struct {
						Content string `json:"content"`
					}{Content: tt.content}},
				},
			}

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(response)
			}))
			defer server.Close()

			client := newTestClient(server.URL)
			result, err := client.RecognizeFood(context.Background(), []byte("img"), "image/png")

			require.NoError(t, err)
			require.Len(t, result.Items, 1)
			assert.Equal(t, "Яблоко", result.Items[0].Name)
		})
	}
}

func TestRecognizeFood_InvalidJSON(t *testing.T) {
	response := chatResponse{
		Choices: []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		}{
			{Message: struct {
				Content string `json:"content"`
			}{Content: "This is not JSON at all"}},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	_, err := client.RecognizeFood(context.Background(), []byte("img"), "image/jpeg")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to parse recognition result")
}

func TestRecognizeFood_HTTPError(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
	}{
		{"server error", http.StatusInternalServerError},
		{"rate limited", http.StatusTooManyRequests},
		{"bad request", http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.statusCode)
				w.Write([]byte(`{"error": "test error"}`))
			}))
			defer server.Close()

			client := newTestClient(server.URL)
			_, err := client.RecognizeFood(context.Background(), []byte("img"), "image/jpeg")

			require.Error(t, err)
			assert.Contains(t, err.Error(), "OpenRouter API error")
		})
	}
}

func TestRecognizeFood_APIError(t *testing.T) {
	response := chatResponse{
		Error: &struct {
			Message string `json:"message"`
		}{Message: "insufficient credits"},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	_, err := client.RecognizeFood(context.Background(), []byte("img"), "image/jpeg")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient credits")
}

func TestRecognizeFood_EmptyChoices(t *testing.T) {
	response := chatResponse{
		Choices: []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		}{},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	_, err := client.RecognizeFood(context.Background(), []byte("img"), "image/jpeg")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "no choices")
}

func TestRecognizeFood_Timeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	client.httpClient.Timeout = 100 * time.Millisecond

	_, err := client.RecognizeFood(context.Background(), []byte("img"), "image/jpeg")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "request failed")
}

// Умолчания для имени модели нет намеренно: у Яндекса оно включает
// идентификатор каталога и у каждой установки своё. Пустое имя остаётся
// пустым, и возможность считается ненастроенной — вместо того чтобы слать
// запросы с чужим именем и получать отказ на каждый.
func TestNewClient_ModelHasNoDefault(t *testing.T) {
	log := logger.New()
	c := NewClient("key", "", log)
	assert.Empty(t, c.model)
}

func TestNewClient_CustomModel(t *testing.T) {
	log := logger.New()
	c := NewClient("key", "gpt://каталог/yandexgpt/latest", log)
	assert.Equal(t, "gpt://каталог/yandexgpt/latest", c.model)
}

func TestStripMarkdownCodeFences(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"plain json", `{"items": []}`, `{"items": []}`},
		{"json fence", "```json\n{\"items\": []}\n```", `{"items": []}`},
		{"plain fence", "```\n{\"items\": []}\n```", `{"items": []}`},
		{"with whitespace", "  ```json\n  {\"items\": []}  \n```  ", `{"items": []}`},
		{"no fence text", "some text", "some text"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := stripMarkdownCodeFences(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Модель со зрением в каталоге Яндекса — рассуждающая: она складывает
// размышление в reasoning_content и оставляет content пустым, пока не
// закончит. На живой проверке с бюджетом в 2000 токенов размышление заняло
// весь бюджет, и ответа так и не появилось. Отключается это единственным
// способом: chat_template_kwargs с enable_thinking=false. Родной яндексовый
// reasoning_options на OpenAI-совместимом эндпоинте отвергается.
func TestRecognizeFood_DisablesThinkingAndBoundsTheAnswer(t *testing.T) {
	var body map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"items\":[]}"}}]}`))
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	_, err := client.RecognizeFood(context.Background(), []byte("image"), "image/jpeg")
	require.NoError(t, err)

	kwargs, ok := body["chat_template_kwargs"].(map[string]any)
	require.True(t, ok, "запрос распознавания обязан нести chat_template_kwargs, получено: %v", body)
	assert.Equal(t, false, kwargs["enable_thinking"],
		"без этого модель сжигает бюджет на размышление и возвращает пустой content")

	limit, ok := body["max_tokens"].(float64)
	require.True(t, ok, "запрос без предела длины — это счёт без потолка")
	assert.Positive(t, limit)
}

// Бот поддержки работает на другой модели, и его путь этой правкой не
// затрагивается: скрытое поведение, включённое для обоих потребителей клиента,
// однажды сломает того, кого не проверяли.
func TestAsk_DoesNotDisableThinking(t *testing.T) {
	var body map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ответ"}}]}`))
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	_, err := client.Ask(context.Background(), "префикс", "вопрос", nil)
	require.NoError(t, err)

	_, present := body["chat_template_kwargs"]
	assert.False(t, present, "путь бота не должен нести параметры шаблона: %v", body)
}

// Пустой content и сейчас не проходит молча — разбор пустой строки падает. Но
// падает он сообщением про испорченный ответ, хотя ответа не было вовсе, и
// разбираться по такому сообщению пришлось бы с нуля.
func TestRecognizeFood_EmptyContentSaysTheModelReturnedNothing(t *testing.T) {
	cases := map[string]string{
		"content null":          `{"choices":[{"message":{"content":null}}]}`,
		"content пустая строка": `{"choices":[{"message":{"content":""}}]}`,
		"бюджет исчерпан":       `{"choices":[{"finish_reason":"length","message":{"content":null,"reasoning_content":"долго думал"}}]}`,
	}

	for name, response := range cases {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(response))
			}))
			defer server.Close()

			client := newTestClient(server.URL)
			_, err := client.RecognizeFood(context.Background(), []byte("image"), "image/jpeg")

			require.Error(t, err)
			assert.True(t, errors.Is(err, ErrEmptyModelAnswer),
				"пустой ответ обязан быть отличим от испорченного, получено: %v", err)
		})
	}
}

// Охраняет разделение: испорченный ответ — это другая ошибка, и она не должна
// схлопнуться в «модель ничего не вернула» вместе с пустым.
func TestRecognizeFood_MalformedContentIsNotTheEmptyError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"это не json"}}]}`))
	}))
	defer server.Close()

	client := newTestClient(server.URL)
	_, err := client.RecognizeFood(context.Background(), []byte("image"), "image/jpeg")

	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrEmptyModelAnswer))
}
