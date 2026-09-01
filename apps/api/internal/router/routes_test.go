package router

import (
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// testEngine builds the real routing table. Handlers are nil pointers: route
// registration only takes method values, it never calls them, so the engine can
// be assembled without a database, S3 or SMTP.
func testEngine(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	return New(Deps{
		Cfg:             &config.Config{Env: "test", JWTSecret: "test-secret"},
		Log:             logger.New(),
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
	})
}

func actualRoutes(t *testing.T) []string {
	t.Helper()
	var out []string
	for _, r := range testEngine(t).Routes() {
		out = append(out, r.Method+" "+r.Path)
	}
	sort.Strings(out)
	return out
}

// The refactor that moved routing out of main.go must not add, drop or rename a
// single route. The golden file was captured from the pre-refactor main.go.
//
// Regenerate deliberately with -update after an intentional routing change, and
// review the diff — a surprise line here means a route appeared or vanished.
func TestRoutesMatchGolden(t *testing.T) {
	const goldenPath = "testdata/routes.golden"

	actual := strings.Join(actualRoutes(t), "\n") + "\n"

	if os.Getenv("UPDATE_GOLDEN") == "1" {
		require.NoError(t, os.WriteFile(goldenPath, []byte(actual), 0o644))
		t.Log("golden file updated")
		return
	}

	expected, err := os.ReadFile(goldenPath)
	require.NoError(t, err)
	require.Equal(t, string(expected), actual,
		"routing table changed; if intentional, rerun with UPDATE_GOLDEN=1 and review the diff")
}
