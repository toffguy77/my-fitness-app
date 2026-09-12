package llm

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The support bot sends the whole user guide before every question, so the
// provider's prompt cache decides whether that costs a little or a lot. A cache
// that stops working raises no error and logs nothing: the only symptom is the
// bill. These tests cover the reading of the number that makes it visible.
func TestUsageReporting(t *testing.T) {
	tests := []struct {
		name         string
		body         string
		wantReported bool
		wantPrompt   int
		wantCached   int
	}{
		{
			name: "провайдер прочитал почти всё из кэша",
			body: `{"choices":[{"message":{"content":"ответ"}}],
			        "usage":{"prompt_tokens":12000,"prompt_tokens_details":{"cached_tokens":11800}}}`,
			wantReported: true, wantPrompt: 12000, wantCached: 11800,
		},
		{
			name: "кэш не сработал — то же число, но целиком свежее",
			body: `{"choices":[{"message":{"content":"ответ"}}],
			        "usage":{"prompt_tokens":12000,"prompt_tokens_details":{"cached_tokens":0}}}`,
			wantReported: true, wantPrompt: 12000, wantCached: 0,
		},
		{
			// Отсутствие блока — это «провайдер не сказал», а не «из кэша
			// не прочитано ничего». Сообщать ноль значило бы придумать
			// показание и уронить долю на ровном месте.
			name:         "провайдер не сообщил usage",
			body:         `{"choices":[{"message":{"content":"ответ"}}]}`,
			wantReported: false,
		},
		{
			name: "usage есть, но подробностей о кэше нет",
			body: `{"choices":[{"message":{"content":"ответ"}}],
			        "usage":{"prompt_tokens":900}}`,
			wantReported: true, wantPrompt: 900, wantCached: 0,
		},
		{
			name: "нулевой prompt_tokens ничего не значит",
			body: `{"choices":[{"message":{"content":"ответ"}}],
			        "usage":{"prompt_tokens":0,"prompt_tokens_details":{"cached_tokens":0}}}`,
			wantReported: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var resp chatResponse
			require.NoError(t, json.Unmarshal([]byte(tt.body), &resp))

			var gotPrompt, gotCached int
			reported := false
			resp.report(func(prompt, cached int) {
				reported = true
				gotPrompt, gotCached = prompt, cached
			})

			assert.Equal(t, tt.wantReported, reported)
			if tt.wantReported {
				assert.Equal(t, tt.wantPrompt, gotPrompt)
				assert.Equal(t, tt.wantCached, gotCached)
			}
		})
	}
}

// A client with no observer is the normal case in tests and in any deployment
// without metrics wired. It must not panic.
func TestUsageReportingWithoutObserver(t *testing.T) {
	var resp chatResponse
	require.NoError(t, json.Unmarshal(
		[]byte(`{"usage":{"prompt_tokens":10,"prompt_tokens_details":{"cached_tokens":5}}}`), &resp))

	assert.NotPanics(t, func() { resp.report(nil) })
}

// Потолок ответа отправляется всегда.
//
// Без него провайдер берёт предел модели — 65536 токенов — и резервирует под
// него средства. Запрос отклоняется целиком при нехватке резерва, даже когда
// настоящий ответ стоил бы копейки: именно так бот поддержки оказался
// неработоспособным при небольшом остатке на счёте, отвечая «передал человеку»
// на каждый вопрос.
func TestSupportRequestCapsTheAnswer(t *testing.T) {
	body, err := json.Marshal(chatRequest{
		Model: "любая", Messages: nil, MaxTokens: supportAnswerLimit,
	})
	require.NoError(t, err)

	var decoded map[string]any
	require.NoError(t, json.Unmarshal(body, &decoded))

	assert.Equal(t, float64(supportAnswerLimit), decoded["max_tokens"])
	assert.Less(t, supportAnswerLimit, 4000,
		"потолок должен оставаться скромным: инструкция велит отвечать двумя-тремя предложениями")
}

// Схема авторизации у провайдеров разная: `Bearer` у OpenAI-совместимых,
// `Api-Key` у Яндекса. Запрос с чужой схемой отклоняется, и разбираться
// пришлось бы по коду ответа вместо очевидного — поэтому адрес и схема
// задаются вместе, одним вызовом.
func TestEndpointAndSchemeTravelTogether(t *testing.T) {
	c := NewClient("ключ", "модель", nil)

	assert.Equal(t, DefaultAuthScheme, c.authScheme, "по умолчанию — схема Яндекса")
	assert.Equal(t, DefaultBaseURL, c.baseURL)

	c.WithEndpoint("https://openrouter.ai/api/v1/chat/completions", "Bearer")
	assert.Equal(t, "Bearer", c.authScheme)
	assert.Contains(t, c.baseURL, "openrouter")

	// Пустые значения ничего не портят: так конфигурация без явных настроек
	// оставляет умолчания, а не обнуляет их.
	c.WithEndpoint("", "")
	assert.Equal(t, "Bearer", c.authScheme)
	assert.Contains(t, c.baseURL, "openrouter")
}
