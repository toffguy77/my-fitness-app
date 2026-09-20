//go:build live

package llm

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/require"
)

// Живая проверка распознавания: настоящая модель, настоящая фотография,
// наш собственный клиент целиком.
//
// Отдельный тег сборки, потому что тест тратит деньги и требует доступа к
// поставщику. Без него всё остальное про распознавание проверяется на
// подменённом сервере — а подмена не расскажет ни про рассуждающую модель,
// ни про то, узнаёт ли она еду.
//
// Запуск:
//
//	VISION_API_KEY=... VISION_MODEL=gpt://<folder>/qwen3.6-35b-a3b \
//	VISION_AUTH_SCHEME=Api-Key VISION_PHOTOS=<каталог с .jpg> \
//	go test -tags=live ./internal/shared/llm/ -run TestLiveVision -v
func TestLiveVisionRecognizesRealPhotos(t *testing.T) {
	key := os.Getenv("VISION_API_KEY")
	model := os.Getenv("VISION_MODEL")
	dir := os.Getenv("VISION_PHOTOS")
	if key == "" || model == "" || dir == "" {
		t.Skip("нужны VISION_API_KEY, VISION_MODEL и VISION_PHOTOS")
	}

	scheme := os.Getenv("VISION_AUTH_SCHEME")
	if scheme == "" {
		scheme = DefaultAuthScheme
	}
	base := os.Getenv("VISION_BASE_URL")
	if base == "" {
		base = DefaultBaseURL
	}

	photos, err := filepath.Glob(filepath.Join(dir, "*.jpg"))
	require.NoError(t, err)
	require.NotEmpty(t, photos, "в каталоге нет фотографий")

	var promptTokens, cachedTokens int
	client := NewClient(key, model, logger.New()).
		WithEndpoint(base, scheme).
		WithUsageObserver(func(prompt, cached int) {
			promptTokens, cachedTokens = prompt, cached
		})

	for _, photo := range photos {
		t.Run(filepath.Base(photo), func(t *testing.T) {
			data, err := os.ReadFile(photo)
			require.NoError(t, err)

			result, err := client.RecognizeFood(context.Background(), data, "image/jpeg")
			require.NoError(t, err, "распознавание не должно падать на настоящей фотографии")
			require.NotEmpty(t, result.Items, "модель обязана назвать хотя бы одно блюдо")

			// Печатаем состав целиком: качество распознавания оценивает
			// человек, читающий вывод, а не утверждение в тесте.
			pretty, _ := json.MarshalIndent(result, "", "  ")
			t.Logf("%s: блюд %d, промпт %d токенов (из кэша %d)\n%s",
				filepath.Base(photo), len(result.Items), promptTokens, cachedTokens, pretty)

			for _, item := range result.Items {
				require.NotEmpty(t, item.Name, "у блюда должно быть название")
				require.Positive(t, item.EstimatedWeight, "вес должен быть положительным")
			}
		})
	}
}
