package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// getAs issues a GET signed for the given role, reusing signedToken so this
// file cannot drift from the token-minting the authorization matrix tests
// already depend on. An empty role still mints a valid, authenticated token
// — one whose role simply matches nothing in RequireRole — so it exercises
// the role check, not the authentication check.
func getAs(t *testing.T, engine *gin.Engine, path, role string) *httptest.ResponseRecorder {
	t.Helper()
	return requestAs(t, engine, http.MethodGet, path, role)
}

// requestAs is getAs generalized over the HTTP method, for routes that only
// answer to POST/PUT/DELETE — a test that only ever calls getAs on such a
// group tests nothing about its id-carrying routes at all.
func requestAs(t *testing.T, engine *gin.Engine, method, path, role string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, 1, role))
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	return w
}

// Расширение прав проверяется с обеих сторон: и что куратор теперь проходит,
// и что все остальные по-прежнему нет. Тест только на первое превращает
// расширение роли в открытую дверь при первой же ошибке в middleware.
//
// "Проходит" здесь означает именно это, а не "не 403 и не 404": 401 и 5xx —
// тоже отказ доступа той роли, ради которой существует задача, и обязаны
// краснить именно этот тест, а не только тест на отказ остальным.
func TestCuratorLeadRoutesAllowCoordinatorAndAdmin(t *testing.T) {
	r := testEngine(t)

	for _, role := range []string{"coordinator", "super_admin"} {
		w := getAs(t, r, "/api/v1/curator/leads", role)
		assert.NotEqual(t, http.StatusForbidden, w.Code, "роль %q обязана проходить", role)
		assert.NotEqual(t, http.StatusUnauthorized, w.Code, "роль %q обязана проходить", role)
		assert.NotEqual(t, http.StatusNotFound, w.Code, "роль %q обязана проходить", role)
	}
}

func TestCuratorLeadRoutesDenyEveryoneElse(t *testing.T) {
	r := testEngine(t)

	for _, role := range []string{"user", "client", ""} {
		w := getAs(t, r, "/api/v1/curator/leads", role)
		assert.Equal(t, http.StatusForbidden, w.Code, "роль %q не должна проходить", role)
	}
}

func TestLeadRoutesRequireAuthentication(t *testing.T) {
	r := testEngine(t)

	w := get(r, "/api/v1/curator/leads")

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Пара путей к одним данным с разными проверками роли — именно та
// конструкция, в которой потом теряется проверка. Старый путь удаляется,
// а не остаётся синонимом.
func TestOldAdminLeadPathIsGone(t *testing.T) {
	r := testEngine(t)

	w := getAs(t, r, "/api/v1/admin/leads", "super_admin")

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// Четыре маршрута очереди разговоров: список, тред, ответ, закрытие. Проверка
// только списка проверяла бы саму группу лишь косвенно — три маршрута с :id
// делят с ней тот же RequireRole, но отдельным утверждением никто не
// прошёлся ни по одному из них.
var supportConversationRoutes = []struct {
	method string
	path   string
}{
	{http.MethodGet, "/api/v1/curator/support/conversations"},
	{http.MethodGet, "/api/v1/curator/support/conversations/1"},
	{http.MethodPost, "/api/v1/curator/support/conversations/1/reply"},
	{http.MethodPost, "/api/v1/curator/support/conversations/1/close"},
}

// Разговоры поддержки: та же пара «доступ / отказ», что и у заявок.
// Утверждение на StatusUnauthorized обязательно — первая редакция теста на
// заявки проверяла только «не 403 и не 404», и отказ по аутентификации
// (401) проходил незамеченным, оставляя раздел недоступным той самой роли,
// ради которой задача делается.
func TestCuratorSupportRoutesAllowCoordinatorAndAdmin(t *testing.T) {
	r := testEngine(t)

	for _, route := range supportConversationRoutes {
		for _, role := range []string{"coordinator", "super_admin"} {
			w := requestAs(t, r, route.method, route.path, role)
			assert.NotEqual(t, http.StatusForbidden, w.Code, "%s %s: роль %q обязана проходить", route.method, route.path, role)
			assert.NotEqual(t, http.StatusUnauthorized, w.Code, "%s %s: роль %q обязана проходить", route.method, route.path, role)
			assert.NotEqual(t, http.StatusNotFound, w.Code, "%s %s: роль %q обязана проходить", route.method, route.path, role)
		}
	}
}

func TestCuratorSupportRoutesDenyEveryoneElse(t *testing.T) {
	r := testEngine(t)

	for _, route := range supportConversationRoutes {
		for _, role := range []string{"user", "client", ""} {
			w := requestAs(t, r, route.method, route.path, role)
			assert.Equal(t, http.StatusForbidden, w.Code, "%s %s: роль %q не должна проходить", route.method, route.path, role)
		}
	}
}

// Список разговоров не несёт :id и потому не входит в реестр protectedRoutes
// — TestRoleProtectedRoutesRequireAuthentication его не видит. Явная проверка
// здесь — то же самое место, что у заявок закрывает TestLeadRoutesRequireAuthentication.
func TestSupportConversationsListRequiresAuthentication(t *testing.T) {
	r := testEngine(t)

	w := get(r, "/api/v1/curator/support/conversations")

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestOldAdminSupportPathIsGone(t *testing.T) {
	r := testEngine(t)

	w := getAs(t, r, "/api/v1/admin/support/conversations", "super_admin")

	assert.Equal(t, http.StatusNotFound, w.Code)
}
