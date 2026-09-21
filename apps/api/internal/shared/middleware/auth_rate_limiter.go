package middleware

import (
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/response"
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
	// Web support widget: public, no session, and every message costs a model
	// call. Per-IP is the first of three ceilings (the other two live in the
	// support module itself: MaxWebMessageRunes bounds one question's size,
	// MaxWebMessagesPerConversation bounds how long one conversation runs) —
	// none of the three alone is enough, since an IP is shared and a token can
	// outlive its window.
	"support-web-start":   {maxRequests: 10, window: time.Minute},
	"support-web-message": {maxRequests: 20, window: time.Minute},
	// Read-only polling for new messages; cheaper than a model call and needs
	// a looser ceiling so a chat window left open does not start failing.
	"support-web-read": {maxRequests: 60, window: time.Minute},
	// «Позвать человека» costs no model call, but it is still a write behind
	// the same bearer token as the other three, and the token is the thing an
	// IP could enumerate — same order of magnitude as support-web-message.
	"support-web-human": {maxRequests: 20, window: time.Minute},
	// Leaving a contact writes a row in leads, same as lead-create — kept
	// tight rather than reused from support-web-message so a visitor who has
	// exhausted their question budget can still leave a contact.
	"support-web-contact": {maxRequests: 5, window: time.Hour},
	// Sends an email to an address the caller only claims to own, same abuse
	// shape as resend-verification: mailer-as-a-service and an unbounded
	// magic_links table if left open.
	"magic-link-request": {maxRequests: 5, window: 15 * time.Minute},
	// Guesses a token, like the other credential-exchange endpoints above.
	"magic-link-consume": {maxRequests: 10, window: 15 * time.Minute},
	// The link at the bottom of a digest email. A person clicks it once — a
	// handful of requests covers a double click or a refresh. The token is an
	// HMAC over "<user id>.<expiry>", so guessing one is not realistically
	// feasible at any request rate; the limit exists so the endpoint (public,
	// unauthenticated, and it writes to the database on every success) cannot
	// be hammered by a script the way a person never would.
	"unsubscribe": {maxRequests: 5, window: 15 * time.Minute},
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

// Limit returns a Gin middleware that enforces rate limiting for the given
// endpoint. endpoint must be a key of authLimitConfigs — see that map for the
// full, current list ("login", "register", "oauth-link", "guest-calculate",
// "lead-create", "analytics", "ws-ticket", "resend-verification",
// "client-logs", "unsubscribe", and whatever has been added since).
//
// Limit is called while routes are being registered, before the server
// starts accepting traffic, so it panics on an unrecognized name instead of
// returning a middleware that silently passes every request through. That
// used to be the behaviour: a typo or a forgotten entry here produced a
// route that looked protected — the middleware was on it, the call read
// correctly — while enforcing nothing, and nothing short of reading this
// function noticed. A startup crash naming the bad endpoint is a strictly
// better failure than a rate limit that quietly does not apply; it is also
// caught earlier, by TestEveryRouterLimitCallHasAConfig, which fails the
// build before the binary is ever run.
func (rl *AuthRateLimiter) Limit(endpoint string) gin.HandlerFunc {
	cfg, ok := authLimitConfigs[endpoint]
	if !ok {
		panic("middleware: no rate limit configured for endpoint " + strconv.Quote(endpoint) +
			" — add an entry to authLimitConfigs in auth_rate_limiter.go")
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
			// Через общий помощник: ответ без кода вынуждает клиента
			// показывать серверную фразу, а это единственный текст, который
			// нельзя перевести.
			response.ErrorCode(c, http.StatusTooManyRequests,
				apperrors.CodeTooManyAttempts,
				"Слишком много попыток. Попробуйте позже.", nil)
			c.Abort()
			return
		}

		// Record this request and proceed.
		valid = append(valid, now)
		bucket.Store(ip, valid)

		c.Next()
	}
}
