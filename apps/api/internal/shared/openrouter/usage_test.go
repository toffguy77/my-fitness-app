package openrouter

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
