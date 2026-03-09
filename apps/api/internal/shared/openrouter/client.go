package openrouter

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/burcev/api/internal/shared/logger"
)

const (
	DefaultBaseURL = "https://openrouter.ai/api/v1/chat/completions"
	DefaultModel   = "anthropic/claude-sonnet-4"
	Timeout        = 30 * time.Second
	UserAgent      = "BurcevFitnessApp/1.0 (https://burcev.team)"
)

// RecognizedFoodItem represents a food item recognized from a photo by the AI model.
type RecognizedFoodItem struct {
	Name            string  `json:"name"`
	EstimatedWeight float64 `json:"estimated_weight_grams"`
	CaloriesPer100  float64 `json:"calories_per_100"`
	ProteinPer100   float64 `json:"protein_per_100"`
	FatPer100       float64 `json:"fat_per_100"`
	CarbsPer100     float64 `json:"carbs_per_100"`
	Confidence      float64 `json:"confidence"`
}

// RecognitionResponse is the parsed AI response containing recognized food items.
type RecognitionResponse struct {
	Items []RecognizedFoodItem `json:"items"`
}

// Client is an HTTP client for the OpenRouter API.
type Client struct {
	apiKey     string
	model      string
	baseURL    string
	httpClient *http.Client
	log        *logger.Logger
}

// NewClient creates a new OpenRouter API client.
func NewClient(apiKey, model string, log *logger.Logger) *Client {
	if model == "" {
		model = DefaultModel
	}
	return &Client{
		apiKey:     apiKey,
		model:      model,
		baseURL:    DefaultBaseURL,
		httpClient: &http.Client{Timeout: Timeout},
		log:        log,
	}
}

// chatRequest is the OpenRouter chat completion request body.
type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type chatMessage struct {
	Role    string        `json:"role"`
	Content []contentPart `json:"content"`
}

type contentPart struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ImageURL *imageURL `json:"image_url,omitempty"`
}

type imageURL struct {
	URL string `json:"url"`
}

// chatResponse is the OpenRouter chat completion response.
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

const systemPrompt = `Ты — эксперт по питанию и нутрициологии. Проанализируй фото еды и определи все видимые продукты и блюда.

Для каждого продукта укажи:
- name: название на русском языке
- estimated_weight_grams: предполагаемый вес порции в граммах
- calories_per_100: калории на 100г
- protein_per_100: белки на 100г (в граммах)
- fat_per_100: жиры на 100г (в граммах)
- carbs_per_100: углеводы на 100г (в граммах)
- confidence: уверенность в распознавании от 0 до 1

Ответь СТРОГО в формате JSON:
{"items": [{"name": "...", "estimated_weight_grams": ..., "calories_per_100": ..., "protein_per_100": ..., "fat_per_100": ..., "carbs_per_100": ..., "confidence": ...}]}

Правила:
- Определяй ВСЕ видимые продукты на фото
- Оценивай вес по визуальному размеру порции
- Используй стандартные значения КБЖУ для типичных продуктов
- Если не уверен в продукте, ставь confidence ниже 0.5
- Отвечай ТОЛЬКО JSON, без дополнительного текста`

// RecognizeFood sends an image to the AI model for food recognition.
func (c *Client) RecognizeFood(ctx context.Context, imageData []byte, contentType string) (*RecognitionResponse, error) {
	b64 := base64.StdEncoding.EncodeToString(imageData)
	dataURL := fmt.Sprintf("data:%s;base64,%s", contentType, b64)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{
				Role: "user",
				Content: []contentPart{
					{Type: "text", Text: systemPrompt},
					{Type: "image_url", ImageURL: &imageURL{URL: dataURL}},
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("HTTP-Referer", "https://burcev.team")
	req.Header.Set("User-Agent", UserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			c.log.Error("failed to close response body", "error", closeErr)
		}
	}()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenRouter API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse API response: %w", err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("OpenRouter API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in API response")
	}

	content := chatResp.Choices[0].Message.Content
	jsonStr := stripMarkdownCodeFences(content)

	var result RecognitionResponse
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return nil, fmt.Errorf("failed to parse recognition result: %w (content: %s)", err, content)
	}

	c.log.Info("food recognition completed", "items_count", len(result.Items), "model", c.model)

	return &result, nil
}

// codeBlockRegex matches ```json ... ``` or ``` ... ``` blocks.
var codeBlockRegex = regexp.MustCompile("(?s)```(?:json)?\\s*(\\{.*?\\})\\s*```")

// stripMarkdownCodeFences removes markdown code fences from AI response if present.
func stripMarkdownCodeFences(s string) string {
	s = strings.TrimSpace(s)

	if matches := codeBlockRegex.FindStringSubmatch(s); len(matches) > 1 {
		return matches[1]
	}

	return s
}
