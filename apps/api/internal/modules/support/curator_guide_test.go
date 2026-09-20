package support

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Раздел про воронку прямым текстом сообщал, что экрана заявок у куратора нет
// и это граница ролей. После переноса очереди заявок и обращений в раздел
// куратора (b5000f82, deddc035) это ложь, а устаревшее описание границ
// доступа хуже отсутствующего: куратор, прочитавший «такого экрана нет»,
// пойдёт не туда, где реально стоит очередь.
//
// Путь считает от текущего файла до корня репозитория пятью «../» — так же,
// как TestKnowledgeMatchesUserGuide в knowledge_test.go, лежащем в том же
// каталоге, считает до docs/user-guide.
func TestCuratorGuideDoesNotDenyLeadAccess(t *testing.T) {
	text, err := os.ReadFile("../../../../../docs/curator-guide/10-воронка-и-возвращение-клиентов.md")
	require.NoError(t, err)

	for _, stale := range []string{
		"только администратору",
		"такого экрана нет",
		"это к администратору",
	} {
		assert.NotContains(t, string(text), stale,
			"устаревшее утверждение о доступе к заявкам: %q", stale)
	}

	assert.Contains(t, string(text), "/curator/leads")
}
