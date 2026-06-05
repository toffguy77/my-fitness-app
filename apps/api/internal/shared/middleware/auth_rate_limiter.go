package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// authLimitConfig holds the parameters for a single endpoint's rate limit.
type authLimitConfig struct {
	maxRequests int
	window      time.Duration
}

var authLimitConfigs = map[string]authLimitConfig{
	"login":    {maxRequests: 10, window: 15 * time.Minute},
	"register": {maxRequests: 5, window: time.Hour},
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
