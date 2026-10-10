package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Сценарий «Роль не клиент»: план есть только у клиента. Куратор и команда
// получают 403 на всех маршрутах плана; без входа — 401.
//
// Обработчики в тестовом движке — nil: дойди запрос до них, ответ был бы 500,
// а не 403.
func TestOnlyClientHasMealPlan(t *testing.T) {
	engine := testEngine(t)
	routes := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/meal-plans/2026-10-10"},
		{http.MethodPost, "/api/v1/meal-plans/2026-10-10/regenerate"},
		{http.MethodGet, "/api/v1/meal-plans/2026-10-10/items/lunch/alternatives"},
		{http.MethodPut, "/api/v1/meal-plans/2026-10-10/items/lunch"},
		{http.MethodGet, "/api/v1/meal-plan-settings"},
		{http.MethodPut, "/api/v1/meal-plan-settings"},
		// Сценарий «Куратор» списка покупок.
		{http.MethodGet, "/api/v1/shopping-list"},
		{http.MethodGet, "/api/v1/shopping-list?from=2026-10-10&to=2026-10-11"},
	}
	for _, r := range routes {
		for _, role := range []string{"coordinator", "super_admin"} {
			req := httptest.NewRequest(r.method, r.path, nil)
			req.Header.Set("Authorization", "Bearer "+signedToken(t, 1, role))
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, req)
			assert.Equal(t, http.StatusForbidden, w.Code, "%s %s as %s", r.method, r.path, role)
		}
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(r.method, r.path, nil))
		assert.Equal(t, http.StatusUnauthorized, w.Code, "%s %s without a session", r.method, r.path)
	}
}
