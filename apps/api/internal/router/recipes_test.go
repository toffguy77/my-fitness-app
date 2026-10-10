package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Сценарий «Клиент или команда пытаются одобрить»: одобряет только куратор.
// super_admin — не надмножество coordinator: RequireRole сравнивает точно, и
// проверка, которую может пройти любой из двух, превратилась бы в формальность.
//
// Обработчики в тестовом движке — nil: дойди запрос до них, тест упал бы
// паникой (500), а не 403.
func TestOnlyCoordinatorReviewsRecipes(t *testing.T) {
	engine := testEngine(t)
	routes := []struct{ method, path string }{
		{http.MethodPost, "/api/v1/curator/recipes/1/approve"},
		{http.MethodPost, "/api/v1/curator/recipes/1/return"},
		{http.MethodGet, "/api/v1/curator/recipes/review"},
		{http.MethodGet, "/api/v1/curator/recipes"},
	}
	for _, role := range []string{"client", "super_admin"} {
		for _, r := range routes {
			req := httptest.NewRequest(r.method, r.path, nil)
			req.Header.Set("Authorization", "Bearer "+signedToken(t, 1, role))
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, req)
			assert.Equal(t, http.StatusForbidden, w.Code, "%s %s as %s", r.method, r.path, role)
		}
	}
}

// Писать рецепты может только команда: куратор и клиент получают 403 на всех
// маршрутах /admin/recipes, включая те, что без идентификатора в пути (их
// реестр protectedRoutes не проверяет).
func TestOnlyTeamWritesRecipes(t *testing.T) {
	engine := testEngine(t)
	routes := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/admin/recipes"},
		{http.MethodPost, "/api/v1/admin/recipes"},
		{http.MethodPost, "/api/v1/admin/recipes/photos"},
		{http.MethodGet, "/api/v1/admin/recipes/catalogue-search"},
		{http.MethodGet, "/api/v1/admin/recipes/import/vkusvill"},
	}
	for _, role := range []string{"client", "coordinator"} {
		for _, r := range routes {
			req := httptest.NewRequest(r.method, r.path, nil)
			req.Header.Set("Authorization", "Bearer "+signedToken(t, 1, role))
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, req)
			assert.Equal(t, http.StatusForbidden, w.Code, "%s %s as %s", r.method, r.path, role)
		}
	}
}
