package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// newTestRouter builds a minimal Gin router with the auth rate limiter applied.
func newTestRouter(endpoint string) *gin.Engine {
	router := gin.New()
	rl := NewAuthRateLimiter()
	router.POST("/test", rl.Limit(endpoint), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	return router
}

// fireRequest sends a POST to /test from the given remoteAddr and returns the status code.
func fireRequest(router *gin.Engine, remoteAddr string) int {
	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	req.RemoteAddr = remoteAddr + ":1234"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w.Code
}

// TestLoginRateLimit_BlocksAfterMaxRequests fires 11 requests from the same IP
// and asserts the 11th (index 10) is rejected with HTTP 429.
func TestLoginRateLimit_BlocksAfterMaxRequests(t *testing.T) {
	router := newTestRouter("login")
	const max = 10

	for i := range max {
		code := fireRequest(router, "192.168.1.1")
		if code != http.StatusOK {
			t.Fatalf("request %d: expected 200 got %d", i+1, code)
		}
	}

	// The 11th request must be rate-limited.
	code := fireRequest(router, "192.168.1.1")
	if code != http.StatusTooManyRequests {
		t.Fatalf("request 11: expected 429 got %d", code)
	}
}

// TestLoginRateLimit_DifferentIPsAreIndependent ensures that requests from
// different IPs do not share rate-limit counters.
func TestLoginRateLimit_DifferentIPsAreIndependent(t *testing.T) {
	router := newTestRouter("login")
	const max = 10

	// Exhaust quota for IP A.
	for range max {
		fireRequest(router, "10.0.0.1")
	}

	// IP B should still be allowed.
	code := fireRequest(router, "10.0.0.2")
	if code != http.StatusOK {
		t.Fatalf("different IP: expected 200 got %d", code)
	}
}

// TestRegisterRateLimit_BlocksAfterMaxRequests fires 6 requests and asserts
// the 6th is rejected (register limit is 5 per hour).
func TestRegisterRateLimit_BlocksAfterMaxRequests(t *testing.T) {
	router := newTestRouter("register")
	const max = 5

	for i := range max {
		code := fireRequest(router, "172.16.0.1")
		if code != http.StatusOK {
			t.Fatalf("request %d: expected 200 got %d", i+1, code)
		}
	}

	code := fireRequest(router, "172.16.0.1")
	if code != http.StatusTooManyRequests {
		t.Fatalf("request 6: expected 429 got %d", code)
	}
}
