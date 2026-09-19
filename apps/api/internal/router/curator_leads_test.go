package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

// routerForTest builds the real routing table with no database, S3 or SMTP —
// registration only takes method values, it never calls them.
func routerForTest(t *testing.T) *gin.Engine {
	t.Helper()
	return testEngine(t)
}

// getAs issues a GET signed for the given role. An empty role still mints a
// valid, authenticated token — one whose role simply matches nothing in
// RequireRole — so it exercises the role check, not the authentication check.
func getAs(engine *gin.Engine, path, role string) *httptest.ResponseRecorder {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.UserClaims{
		UserID: 1,
		Email:  "curator-leads-test@example.com",
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	signed, err := token.SignedString([]byte("test-secret"))
	if err != nil {
		panic(err)
	}

	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	return w
}

// Расширение прав проверяется с обеих сторон: и что куратор теперь проходит,
// и что все остальные по-прежнему нет. Тест только на первое превращает
// расширение роли в открытую дверь при первой же ошибке в middleware.
func TestCuratorLeadRoutesAllowCoordinatorAndAdmin(t *testing.T) {
	r := routerForTest(t)

	for _, role := range []string{"coordinator", "super_admin"} {
		w := getAs(r, "/api/v1/curator/leads", role)
		assert.NotEqual(t, http.StatusForbidden, w.Code, "роль %q обязана проходить", role)
		assert.NotEqual(t, http.StatusNotFound, w.Code)
	}
}

func TestCuratorLeadRoutesDenyEveryoneElse(t *testing.T) {
	r := routerForTest(t)

	for _, role := range []string{"user", "client", ""} {
		w := getAs(r, "/api/v1/curator/leads", role)
		assert.Equal(t, http.StatusForbidden, w.Code, "роль %q не должна проходить", role)
	}
}

func TestLeadRoutesRequireAuthentication(t *testing.T) {
	r := routerForTest(t)

	w := get(r, "/api/v1/curator/leads")

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Пара путей к одним данным с разными проверками роли — именно та
// конструкция, в которой потом теряется проверка. Старый путь удаляется,
// а не остаётся синонимом.
func TestOldAdminLeadPathIsGone(t *testing.T) {
	r := routerForTest(t)

	w := getAs(r, "/api/v1/admin/leads", "super_admin")

	assert.Equal(t, http.StatusNotFound, w.Code)
}
