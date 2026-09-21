package middleware

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// limitCallPattern matches every call site of the form
// `<something>.Limit("name")`, wherever it appears in a call chain such as
// `d.AuthRateLimiter.Limit("unsubscribe")`.
var limitCallPattern = regexp.MustCompile(`\.Limit\(\s*"([^"]+)"\s*\)`)

// TestEveryRouterLimitCallHasAConfig guards the defect that shipped: Limit
// silently passes a request through when asked for a name absent from
// authLimitConfigs, instead of failing loudly. A typo, or an entry someone
// forgot to add, turns the middleware into a no-op that still sits on the
// route looking like protection — the build is green, the test suite is
// green, and code review sees a call that looks correct.
//
// This walks internal/router's source directly rather than the compiled
// route table, because the defect lives in the string literal passed to
// Limit, which runtime route introspection cannot see.
func TestEveryRouterLimitCallHasAConfig(t *testing.T) {
	const routerDir = "../../router"

	entries, err := os.ReadDir(routerDir)
	require.NoError(t, err, "internal/router must exist relative to this test")

	found := map[string]bool{}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".go" {
			continue
		}
		src, err := os.ReadFile(filepath.Join(routerDir, entry.Name()))
		require.NoError(t, err)
		for _, m := range limitCallPattern.FindAllSubmatch(src, -1) {
			found[string(m[1])] = true
		}
	}

	// If the pattern above stops matching anything — because the call syntax
	// changed, or the regex got mangled by an edit — an empty `found` would
	// make the assertion below pass vacuously and this guard would protect
	// nothing while still reporting green. Finding zero calls is therefore a
	// failure in its own right, not a clean bill of health.
	require.NotEmpty(t, found,
		"found no calls to Limit(\"...\") under internal/router; either the "+
			"rate limiter has been removed from every route (unlikely) or "+
			"limitCallPattern no longer matches the call syntax — fix the pattern")

	var missing []string
	for name := range found {
		if _, ok := authLimitConfigs[name]; !ok {
			missing = append(missing, name)
		}
	}

	assert.Empty(t, missing,
		"internal/router calls AuthRateLimiter.Limit with a name absent from "+
			"authLimitConfigs: %v — Limit silently skips rate limiting for an "+
			"unrecognized name, so this endpoint is currently unprotected", missing)
}
