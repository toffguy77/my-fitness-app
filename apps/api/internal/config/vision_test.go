package config

import (
	"os"
	"testing"

	"github.com/burcev/api/internal/shared/llm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// clearVisionEnv убирает всё, что влияет на поставщика зрения, чтобы тест
// видел умолчания, а не окружение разработчика.
func clearVisionEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"VISION_API_KEY", "VISION_MODEL", "VISION_BASE_URL", "VISION_AUTH_SCHEME",
		"OPENROUTER_API_KEY", "OPENROUTER_MODEL",
	} {
		t.Setenv(key, "")
		os.Unsetenv(key)
	}
}

// Умолчание поставщика зрения раньше указывало на OpenRouter — туда же, откуда
// текстовый путь уже уехал, потому что он здесь не оплачивается. Способность
// из-за этого не включалась ничем, кроме явной перенастройки.
func TestVisionDefaultsPointAtTheReachableProvider(t *testing.T) {
	clearConfigEnv(t)
	clearVisionEnv(t)
	t.Setenv("JWT_SECRET", "test-secret-value-long-enough-to-pass")
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb")

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, llm.DefaultBaseURL, cfg.VisionBaseURL,
		"умолчание обязано совпадать с текстовым путём: модель со зрением живёт на том же эндпоинте")
	assert.Equal(t, llm.DefaultAuthScheme, cfg.VisionAuthScheme)
	assert.NotContains(t, cfg.VisionBaseURL, "openrouter")
}

func TestVisionProviderCanBeOverridden(t *testing.T) {
	clearConfigEnv(t)
	clearVisionEnv(t)
	t.Setenv("JWT_SECRET", "test-secret-value-long-enough-to-pass")
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb")
	t.Setenv("VISION_BASE_URL", "https://example.test/v1/chat/completions")
	t.Setenv("VISION_AUTH_SCHEME", "Bearer")

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, "https://example.test/v1/chat/completions", cfg.VisionBaseURL)
	assert.Equal(t, "Bearer", cfg.VisionAuthScheme)
}

// Ключ не подставляется из настроек текстового поставщика: общий ключ должен
// быть осознанным решением эксплуатации, а не следствием умолчания.
func TestFoodRecognitionNeedsBothKeyAndModel(t *testing.T) {
	cases := []struct {
		name    string
		key     string
		model   string
		enabled bool
	}{
		{"ни ключа, ни модели", "", "", false},
		{"ключ без модели", "k", "", false},
		{"модель без ключа", "", "gpt://folder/qwen", false},
		{"ключ и модель", "k", "gpt://folder/qwen", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clearConfigEnv(t)
			clearVisionEnv(t)
			t.Setenv("JWT_SECRET", "test-secret-value-long-enough-to-pass")
			t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb")
			t.Setenv("LLM_API_KEY", "текстовый ключ, зрению не отдаётся")
			if tc.key != "" {
				t.Setenv("VISION_API_KEY", tc.key)
			}
			if tc.model != "" {
				t.Setenv("VISION_MODEL", tc.model)
			}

			cfg, err := Load()
			require.NoError(t, err)

			assert.Equal(t, tc.enabled, cfg.Features.FoodRecognition)
		})
	}
}
