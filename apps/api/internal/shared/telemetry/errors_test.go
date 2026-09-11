package telemetry

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A panic must still answer the caller. Reporting it is the second job, and it
// must not become the reason nobody gets a response.
func TestPanicBecomesA500(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var reported any
	r := gin.New()
	r.Use(Recovery(func(_ *gin.Context, recovered any) { reported = recovered }))
	r.GET("/boom", func(c *gin.Context) { panic("something gave way") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Equal(t, "something gave way", reported)
}

func TestAnAnswerAlreadyWrittenIsNotOverwritten(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.Use(Recovery(nil))
	r.GET("/half", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"partial": true})
		panic("after the fact")
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/half", nil))

	assert.Equal(t, http.StatusOK, w.Code)
}

// An error report is read by whoever is on call — a wider audience than the
// person whose data it would otherwise carry.
func TestReportsCarryNothingPersonal(t *testing.T) {
	event := &sentry.Event{
		Request: &sentry.Request{
			URL:         "https://burcev.team/api/v1/chat/messages",
			Data:        `{"content":"я сегодня сорвался и съел торт"}`,
			QueryString: "token=reset-token-value",
			Cookies:     "refresh_token=secret",
			Headers: map[string]string{
				"Authorization":   "Bearer secret-token",
				"Cookie":          "refresh_token=secret",
				"X-Request-Id":    "4f2a9c1e",
				"User-Agent":      "Safari",
				"Accept-Language": "ru",
			},
		},
		Breadcrumbs: []*sentry.Breadcrumb{{
			Data: map[string]any{"body": "что-то личное", "url": "/api/v1/chat/messages"},
		}},
	}

	scrubbed := scrub(event, nil)

	assert.Empty(t, scrubbed.Request.Data, "the body is where the personal half is")
	assert.Empty(t, scrubbed.Request.QueryString, "a query string carries reset and unsubscribe tokens")
	assert.Empty(t, scrubbed.Request.Cookies)
	assert.NotContains(t, scrubbed.Request.Headers, "Authorization")
	assert.NotContains(t, scrubbed.Request.Headers, "Cookie")
	assert.Equal(t, "4f2a9c1e", scrubbed.Request.Headers["X-Request-Id"],
		"the identifier is what makes the report worth reading")
	assert.Equal(t, "Safari", scrubbed.Request.Headers["User-Agent"])
	assert.NotContains(t, scrubbed.Breadcrumbs[0].Data, "body")
	assert.Contains(t, scrubbed.Breadcrumbs[0].Data, "url", "where it happened is fine")
}

// Headers are kept by a list of what to keep, not what to remove: a removal
// list has to be kept in step with every header anybody adds, and it will not
// be.
func TestAnUnknownHeaderIsDroppedRatherThanKept(t *testing.T) {
	event := &sentry.Event{Request: &sentry.Request{
		Headers: map[string]string{"X-Some-New-Thing": "who knows what"},
	}}

	assert.Empty(t, scrub(event, nil).Request.Headers)
}

func TestErrorReportingIsOffWithoutADSN(t *testing.T) {
	on, err := StartErrorReporting("", "test", "test")

	require.NoError(t, err)
	assert.False(t, on)
}

// The frontend's content-security policy has to allow the host reports go to,
// and it should come from the same setting rather than a second copy.
func TestDSNHost(t *testing.T) {
	assert.Equal(t, "o12345.ingest.sentry.io",
		DSNHost("https://abc123@o12345.ingest.sentry.io/98765"))
	assert.Empty(t, DSNHost(""))
	assert.Empty(t, DSNHost(strings.Repeat("nonsense", 3)))
}

// A browser error reaches the tracker through this application rather than
// straight from the page: one credential, on the server, and nothing extra in
// the bundle a person waits for.
func TestBrowserErrorIsSilentWithoutAClient(t *testing.T) {
	// No DSN configured, so there is no client. This must not panic — the
	// endpoint that calls it answers people's browsers.
	assert.NotPanics(t, func() {
		BrowserError("TypeError: x is undefined", "at Component (page.tsx:12)",
			"/dashboard", "1.2.3", "4f2a9c1e", "42")
	})
}
