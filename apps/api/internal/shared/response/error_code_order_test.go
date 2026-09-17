package response_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ErrorCode принимает код и сообщение именно в этом порядке, и перепутать их
// местами компилятор не мешает: оба аргумента — строки.
//
// Так и случилось на пути регистрации: человек, вводивший занятый адрес,
// получал в поле сообщения слово «conflict», а объяснение по-русски уезжало в
// поле кода — то есть в место, по которому фронтенд различает причины отказа.
// Тест статический, потому что ловить это по одному вызову в юнит-тестах
// пришлось бы девятнадцать раз, и двадцатый всё равно бы проскочил.
func TestErrorCodeCallsPassTheCodeFirst(t *testing.T) {
	root := filepath.Join("..", "..", "..", "internal")

	call := regexp.MustCompile(`response\.ErrorCode\(\s*c\s*,\s*[^,]+,\s*([^,]+),`)

	var offenders []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") ||
			strings.HasSuffix(path, "_test.go") {
			return err
		}
		src, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		for _, m := range call.FindAllSubmatch(src, -1) {
			arg := strings.TrimSpace(string(m[1]))
			if !strings.HasPrefix(arg, "apperrors.Code") {
				offenders = append(offenders, path+" -> "+arg)
			}
		}
		return nil
	})
	require.NoError(t, err)

	assert.Empty(t, offenders,
		"третьим аргументом ErrorCode идёт код из apperrors, а не текст для человека")
}
