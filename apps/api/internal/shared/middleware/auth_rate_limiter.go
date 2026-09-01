package middleware

import (
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// authLimitConfig holds the parameters for a single endpoint's rate limit.
type authLimitConfig struct {
	maxRequests int
	window      time.Duration
}

// authLimitScale multiplies every limit below.
//
// One knob, read once at startup from AUTH_RATE_LIMIT_SCALE. It exists for
// environments where the whole test suite arrives from a single address and
// would otherwise be throttled as if it were one person guessing passwords —
// not to be turned up in production, where these numbers are the point.
var authLimitScale = scaleFromEnv()

func scaleFromEnv() int {
	value, err := strconv.Atoi(os.Getenv("AUTH_RATE_LIMIT_SCALE"))
	if err != nil || value < 1 {
		return 1
	}
	return value
}

var authLimitConfigs = map[string]authLimitConfig{
	"login":    {maxRequests: 10, window: 15 * time.Minute},
	"register": {maxRequests: 5, window: time.Hour},
	// Finishing an external sign-in: the password step is a guessing target
	// against a known address, like login itself.
	"oauth-link": {maxRequests: 10, window: 15 * time.Minute},
	// The guest wizard: arithmetic anybody can ask for, and a table anybody can
	// write a row into. Generous enough for a person redoing their numbers,
	// tight enough that the leads table is not a guestbook.
	"guest-calculate": {maxRequests: 60, window: 15 * time.Minute},
	"lead-create":     {maxRequests: 5, window: time.Hour},
	// Batched, so a busy session sends a handful of requests an hour. The
	// ceiling is what stops a public writable endpoint becoming free storage.
	"analytics": {maxRequests: 120, window: 15 * time.Minute},
	// One per socket connection, plus reconnections. Generous enough for a flaky
	// network, tight enough that nothing mints tickets in a loop.
	"ws-ticket": {maxRequests: 60, window: 15 * time.Minute},
	// Sends an email from our SMTP account, so it is abusable as a mailer.
	"resend-verification": {maxRequests: 3, window: time.Hour},
	// Public endpoint that accepts batches of client errors. A page throwing in
	// a render loop must not be able to flood our own log pipeline.
	"client-logs": {maxRequests: 60, window: time.Minute},
}

// AuthRateLimiter is an in-memory sliding window rate limiter for auth endpoints.
type AuthRateLimiter struct {
	// mu protects the map of per-endpoint maps.
	mu      sync.Mutex
	buckets map[string]*sync.Map // endpoint -> *sync.Map{ip -> []time.Time}
}

// NewAuthRateLimiter creates a new AuthRateLimiter.
func NewAuthRateLimiter() *AuthRateLimiter {
	rl := &AuthRateLimiter{
		buckets: make(map[string]*sync.Map),
	}
	for endpoint := range authLimitConfigs {
		m := &sync.Map{}
		rl.buckets[endpoint] = m
	}
	return rl
}

// Limit returns a Gin middleware that enforces rate limiting for the given endpoint.
// Supported endpoints: "login", "register".
func (rl *AuthRateLimiter) Limit(endpoint string) gin.HandlerFunc {
	cfg, ok := authLimitConfigs[endpoint]
	if !ok {
		// Unknown endpoint – pass through without limiting.
		return func(c *gin.Context) { c.Next() }
	}
	cfg.maxRequests *= authLimitScale

	rl.mu.Lock()
	bucket, exists := rl.buckets[endpoint]
	if !exists {
		bucket = &sync.Map{}
		rl.buckets[endpoint] = bucket
	}
	rl.mu.Unlock()

	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()
		cutoff := now.Add(-cfg.window)

		// Load existing timestamps, prune expired ones, and append the current time.
		raw, _ := bucket.LoadOrStore(ip, []time.Time{})
		timestamps, _ := raw.([]time.Time)

		// Prune entries outside the sliding window.
		valid := timestamps[:0]
		for _, t := range timestamps {
			if t.After(cutoff) {
				valid = append(valid, t)
			}
		}

		if len(valid) >= cfg.maxRequests {
			// Store pruned slice (without the new request) and reject.
			bucket.Store(ip, valid)
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"status":  "error",
				"message": "Слишком много попыток. Попробуйте позже.",
			})
			return
		}

		// Record this request and proceed.
		valid = append(valid, now)
		bucket.Store(ip, valid)

		c.Next()
	}
}
