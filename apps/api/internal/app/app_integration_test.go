//go:build integration

package app

import (
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth/oauth/applestub"
	"github.com/burcev/api/internal/router"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// Build against a real schema produces the routing table production serves.
//
// TestRoutesMatchGolden checks the table with nil handlers; this checks it with
// the handlers main() actually wires. The contract test builds its router the
// same way, so a route that Build does not produce is a route that test would
// never see.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://postgres:itest@localhost:55432/itest?sslmode=disable" \
//	  go test -tags=integration -count=1 ./internal/app/
func TestBuildServesTheGoldenRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testsupport.SchemaWithMigrations(t, "app")
	cfg := &config.Config{Env: "test", JWTSecret: "test-secret-test-secret-test-secret"}

	application := Build(cfg, db, logger.New(), External{})
	engine := router.New(application.Deps)

	var actual []string
	for _, r := range engine.Routes() {
		actual = append(actual, r.Method+" "+r.Path)
	}
	sort.Strings(actual)

	golden, err := os.ReadFile("../router/testdata/routes.golden")
	require.NoError(t, err)
	// routes.golden is captured with no metrics recorder, so it has no
	// /metrics; Build always supplies one. The only route allowed to differ.
	expected := append(strings.Split(strings.TrimSpace(string(golden)), "\n"), "GET /metrics")
	sort.Strings(expected)

	require.Equal(t, expected, actual,
		"app.Build wires a different routing table from routes.golden")
}

// Sign in with Apple собран целиком: при настроенной возможности у сборки
// есть очередь отзыва, она подключена к стиранию и отвязке, задача повтора
// объявлена, а /auth/providers называет apple. Без настройки — ничего из
// этого. Так ловится «написано и протестировано, но нигде не вызвано».
func TestBuildWiresSignInWithApple(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testsupport.SchemaWithMigrations(t, "app_apple")
	stub := applestub.New(t)

	off := Build(&config.Config{Env: "test", JWTSecret: "test-secret-test-secret-test-secret"}, db, logger.New(), External{})
	require.Nil(t, off.AppleRevocations)
	_, declared := off.Jobs.Get("auth.apple-revoke-retry")
	require.False(t, declared)

	cfg := &config.Config{
		Env: "test", JWTSecret: "test-secret-test-secret-test-secret",
		AppleTeamID: applestub.TeamID, AppleBundleID: applestub.BundleID, AppleKeyID: applestub.KeyID,
		ApplePrivateKey: stub.PrivateKeyPEM, AppleTokenEncryptionKey: applestub.EncryptionKey,
	}
	cfg.Features.AppleSignIn = true
	on := Build(cfg, db, logger.New(), External{})
	require.NotNil(t, on.AppleRevocations, "очередь отзыва не собрана")
	_, declared = on.Jobs.Get("auth.apple-revoke-retry")
	require.True(t, declared, "задача повтора отзыва не объявлена")

	engine := router.New(on.Deps)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/auth/providers", nil))
	require.Contains(t, w.Body.String(), `"apple"`)

	// Ключ, который не разбирается, выключает возможность, а не роняет старт.
	broken := *cfg
	broken.ApplePrivateKey = "not a key"
	broken.Features.AppleSignIn = true
	require.Nil(t, Build(&broken, db, logger.New(), External{}).AppleRevocations)
	require.False(t, broken.Features.AppleSignIn)
}
