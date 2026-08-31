package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/auth/oauth"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The handler is exercised without a database on purpose: every case below is
// decided before the flow would ever reach the service.
func newOAuthTestRouter(t *testing.T) *gin.Engine {
	t.Helper()

	registry := oauth.NewRegistry()
	registry.Register(oauth.NewYandex("test-client", "test-secret"))

	h := NewOAuthHandler(&config.Config{AppDomain: "app.example.com"}, logger.New(), nil, registry)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/v1/auth/providers", h.Providers)
	r.GET("/api/v1/auth/oauth/:provider", h.Start)
	r.GET("/api/v1/auth/oauth/:provider/callback", h.Callback)
	return r
}

func flowCookie(res *http.Response, name string) *http.Cookie {
	for _, c := range res.Cookies() {
		if c.Name == name && c.MaxAge >= 0 {
			return c
		}
	}
	return nil
}

// A deployment without credentials must not offer a button that cannot work.
func TestOAuthProviders_ListsOnlyWhatIsConfigured(t *testing.T) {
	w := httptest.NewRecorder()
	newOAuthTestRouter(t).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/auth/providers", nil))

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "yandex")
	assert.NotContains(t, w.Body.String(), "vk")
}

// The state and verifier are the whole defence against a forged callback and a
// stolen authorization code, so they must be HttpOnly and short-lived.
func TestOAuthStart_StoresStateAndVerifierInHttpOnlyCookies(t *testing.T) {
	w := httptest.NewRecorder()
	newOAuthTestRouter(t).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/yandex", nil))

	require.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "oauth.yandex.ru")

	for _, name := range []string{stateCookie, verifierCookie, providerCookie} {
		c := flowCookie(w.Result(), name)
		require.NotNil(t, c, "%s must be set", name)
		assert.True(t, c.HttpOnly, "%s must not be readable by scripts", name)
		assert.True(t, c.Secure, "%s must not travel in the clear", name)
		assert.Equal(t, int(oauthFlowTTL.Seconds()), c.MaxAge)
	}

	// The verifier is the secret half of PKCE: sending it to the provider now
	// would defeat the point of the exchange.
	assert.NotContains(t, w.Header().Get("Location"), flowCookie(w.Result(), verifierCookie).Value)
	assert.NotContains(t, w.Header().Get("Location"), "test-secret")
}

func TestOAuthStart_UnconfiguredProviderIsUnavailable(t *testing.T) {
	w := httptest.NewRecorder()
	newOAuthTestRouter(t).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/vk", nil))

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}

// Each of these callbacks is forged or stale. None may reach the token
// exchange — reaching it would attempt a real network call, so a passing test
// here is also proof the exchange was skipped.
func TestOAuthCallback_RejectsCallbacksThisBrowserDidNotStart(t *testing.T) {
	cases := []struct {
		name    string
		query   string
		cookies map[string]string
	}{
		{
			name:    "state does not match the cookie",
			query:   "?code=c&state=attacker",
			cookies: map[string]string{stateCookie: "genuine", verifierCookie: "v", providerCookie: "yandex"},
		},
		{
			name:  "no flow was started in this browser",
			query: "?code=c&state=anything",
		},
		{
			name:    "the verifier is missing, so PKCE cannot be proved",
			query:   "?code=c&state=s",
			cookies: map[string]string{stateCookie: "s", providerCookie: "yandex"},
		},
		{
			// A state minted for one provider must not be redeemed at another.
			name:    "the flow was started at a different provider",
			query:   "?code=c&state=s",
			cookies: map[string]string{stateCookie: "s", verifierCookie: "v", providerCookie: "vk"},
		},
		{
			name:    "the provider returned no code",
			query:   "?state=s",
			cookies: map[string]string{stateCookie: "s", verifierCookie: "v", providerCookie: "yandex"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/yandex/callback"+tc.query, nil)
			for name, value := range tc.cookies {
				req.AddCookie(&http.Cookie{Name: name, Value: value})
			}
			w := httptest.NewRecorder()

			newOAuthTestRouter(t).ServeHTTP(w, req)

			require.Equal(t, http.StatusFound, w.Code)
			assert.Contains(t, w.Header().Get("Location"), "oauth=invalid_state")
		})
	}
}

// A rejected attempt must not leave a reusable state behind.
func TestOAuthCallback_ClearsTheFlowCookies(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/yandex/callback?code=c&state=attacker", nil)
	req.AddCookie(&http.Cookie{Name: stateCookie, Value: "genuine"})
	req.AddCookie(&http.Cookie{Name: verifierCookie, Value: "v"})
	w := httptest.NewRecorder()

	newOAuthTestRouter(t).ServeHTTP(w, req)

	for _, name := range []string{stateCookie, verifierCookie, providerCookie} {
		assert.Nil(t, flowCookie(w.Result(), name), "%s must be expired", name)
	}
}

// Declining at the provider is a choice, not a failure to report as an error.
func TestOAuthCallback_UserDenialReturnsToSignIn(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/auth/oauth/yandex/callback?error=access_denied&state=s", nil)
	w := httptest.NewRecorder()

	newOAuthTestRouter(t).ServeHTTP(w, req)

	require.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "oauth=cancelled")
	assert.Contains(t, w.Header().Get("Location"), "https://app.example.com")
}
