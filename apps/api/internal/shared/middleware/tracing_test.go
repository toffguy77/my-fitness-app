package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func tracingRouter(handler gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Tracing())
	r.GET("/api/v1/thing/:id", handler)
	return r
}

// A person reporting "request 4f2a… failed" has to be findable. Two identifiers
// for one request means looking in two places and hoping they line up.
func TestTracingDerivesTheIDFromWhatTheClientSent(t *testing.T) {
	var seen string
	r := tracingRouter(func(c *gin.Context) {
		id, _ := c.Get("request_id")
		seen, _ = id.(string)
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/thing/7", nil)
	req.Header.Set(RequestIDHeader, "from-the-client")
	first := httptest.NewRecorder()
	r.ServeHTTP(first, req)

	require.NotEmpty(t, seen)
	assert.Equal(t, seen, first.Header().Get(RequestIDHeader),
		"the response must carry the identifier the logs use")

	// The same client value always resolves to the same identifier, which is
	// what makes it findable at all.
	second := httptest.NewRecorder()
	repeat := httptest.NewRequest(http.MethodGet, "/api/v1/thing/7", nil)
	repeat.Header.Set(RequestIDHeader, "from-the-client")
	r.ServeHTTP(second, repeat)
	assert.Equal(t, first.Header().Get(RequestIDHeader), second.Header().Get(RequestIDHeader))
}

func TestTracingInventsAnIDWhenTheClientSendsNone(t *testing.T) {
	r := tracingRouter(func(c *gin.Context) { c.Status(http.StatusOK) })

	first := httptest.NewRecorder()
	r.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/v1/thing/7", nil))
	second := httptest.NewRecorder()
	r.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/api/v1/thing/7", nil))

	assert.NotEmpty(t, first.Header().Get(RequestIDHeader))
	assert.NotEqual(t, first.Header().Get(RequestIDHeader), second.Header().Get(RequestIDHeader),
		"two unrelated requests must not share an identifier")
}

// Every line written while handling one request must carry the same
// identifier, or following a failure means guessing which lines belong
// together.
func TestEveryLogLineForOneRequestSharesTheID(t *testing.T) {
	var ids []string
	r := tracingRouter(func(c *gin.Context) {
		for i := 0; i < 3; i++ {
			id, _ := c.Get("request_id")
			ids = append(ids, id.(string))
		}
		c.Status(http.StatusOK)
	})

	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/thing/7", nil))

	require.Len(t, ids, 3)
	assert.Equal(t, ids[0], ids[1])
	assert.Equal(t, ids[1], ids[2])
}

// The client's own value is kept alongside, so a request can still be found by
// what the browser called it.
func TestTheClientsOwnValueIsKept(t *testing.T) {
	var sent string
	r := tracingRouter(func(c *gin.Context) {
		value, _ := c.Get("client_request_id")
		sent, _ = value.(string)
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/thing/7", nil)
	req.Header.Set(RequestIDHeader, "browser-side-value")
	r.ServeHTTP(httptest.NewRecorder(), req)

	assert.Equal(t, "browser-side-value", sent)
}
