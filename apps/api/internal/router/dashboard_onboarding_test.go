package router

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Состояние первой недели адресовано клиенту.
//
// Проверяется с обеих сторон: и что клиент проходит, и что куратор с
// администратором нет. Тест только на отказ прошёл бы и на маршруте, закрытом
// для всех, — то есть не доказал бы, что дашборд новичка вообще работает.
func TestOnboardingStateIsForClientsOnly(t *testing.T) {
	r := testEngine(t)

	t.Run("клиент проходит проверку роли", func(t *testing.T) {
		w := getAs(t, r, "/api/v1/dashboard/onboarding", "client")
		assert.NotEqual(t, http.StatusForbidden, w.Code,
			"клиенту состояние первой недели и адресовано")
		assert.NotEqual(t, http.StatusNotFound, w.Code,
			"маршрут должен быть зарегистрирован")
	})

	for _, role := range []string{"coordinator", "super_admin", ""} {
		t.Run("роль "+role+" получает отказ", func(t *testing.T) {
			w := getAs(t, r, "/api/v1/dashboard/onboarding", role)
			assert.Equal(t, http.StatusForbidden, w.Code)
		})
	}
}
