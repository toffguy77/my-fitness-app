package openrouter

import (
	"context"
	"encoding/json"
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
		assert.Equal(t, "Bearer test-api-key", r.Header.Get("Authorization"))

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

func TestNewClient_DefaultModel(t *testing.T) {
	log := logger.New()
	c := NewClient("key", "", log)
	assert.Equal(t, DefaultModel, c.model)
}

func TestNewClient_CustomModel(t *testing.T) {
	log := logger.New()
	c := NewClient("key", "openai/gpt-4o", log)
	assert.Equal(t, "openai/gpt-4o", c.model)
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
