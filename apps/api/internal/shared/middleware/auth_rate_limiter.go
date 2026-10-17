package middleware

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
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

	// Нативный вход считается по паре «адрес + IP» (LimitBy с
	// ByEmailAndIP): сотни абонентов одного мобильного NAT делили бы 10
	// попыток веба на всех. Перебор адресов с одного IP упирается в общий
	// потолок, в десять раз выше веб-лимита.
	"native-login":    {maxRequests: 10, window: 15 * time.Minute},
	"native-login-ip": {maxRequests: 100, window: 15 * time.Minute},
	// Попытки входа в один аккаунт — по адресу почты, с любого IP, общий
	// счётчик веба и приложения (ByEmail). Пара «адрес + IP» не мешает
	// перебирать пароль одного аккаунта с многих адресов; этот лимит мешает.
	// 20 за 15 минут — вдвое выше того, что человек успевает набрать сам
	// (10 попыток в пару «адрес + IP» плюс вход с телефона и с ноутбука),
	// и всё ещё 80 паролей в час на аккаунт против миллионов у перебора.
	"login-account": {maxRequests: 20, window: 15 * time.Minute},
	// Ссылка для входа уходит письмом, и NAT-поправка тут не к месту: её
	// заслуживает вход, а не рассылка. Потолок на IP у приложения рядом с
	// веб-лимитом (5), а письма одному адресату ограничены отдельно — общим
	// счётчиком веба и приложения по адресу получателя (ByEmail): иначе
	// ящик можно заваливать письмами с разных IP.
	"native-magic-link-ip": {maxRequests: 10, window: 15 * time.Minute},
	"magic-link-recipient": {maxRequests: 5, window: 15 * time.Minute},
	"native-refresh":       {maxRequests: 60, window: 15 * time.Minute},
}

// KeyFunc picks what a limit counts by. The endpoint name is prepended by the
// limiter, so two keys never collide across endpoints.
type KeyFunc func(c *gin.Context) string

// ByIP counts by the client address — the default.
func ByIP(c *gin.Context) string { return c.ClientIP() }

// ByEmail counts by the address in the JSON body alone, whatever the IP:
// attempts against one account, or letters to one mailbox. A body without an
// address counts against the IP.
func ByEmail(c *gin.Context) string {
	var body struct {
		Email string `json:"email"`
	}
	peekJSON(c, &body)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" {
		return "ip:" + c.ClientIP()
	}
	return "email:" + email
}

// ByEmailAndIP counts by the address in the JSON body together with the
// client IP. The body is read and put back for the handler. A body without an
// address counts against the IP alone.
func ByEmailAndIP(c *gin.Context) string {
	var body struct {
		Email string `json:"email"`
	}
	peekJSON(c, &body)
	return strings.ToLower(strings.TrimSpace(body.Email)) + "|" + c.ClientIP()
}

// ByRefreshToken counts by the refresh token in the JSON body — by its hash,
// so the limiter's memory never holds a usable credential. A body without one
// counts against the IP.
func ByRefreshToken(c *gin.Context) string {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	peekJSON(c, &body)
	if body.RefreshToken == "" {
		return "ip:" + c.ClientIP()
	}
	sum := sha256.Sum256([]byte(body.RefreshToken))
	return "token:" + hex.EncodeToString(sum[:])
}

// peekJSON decodes the request body into dst and restores it, so the handler
// binds the same bytes. A body that is not JSON leaves dst empty.
func peekJSON(c *gin.Context, dst any) {
	if c.Request.Body == nil {
		return
	}
	raw, err := io.ReadAll(c.Request.Body)
	_ = c.Request.Body.Close()
	c.Request.Body = io.NopCloser(bytes.NewReader(raw))
	if err != nil || len(raw) == 0 {
		return
	}
	_ = json.Unmarshal(raw, dst)
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
	return rl.LimitBy(endpoint, ByIP)
}

// LimitBy is Limit counting by key instead of by IP alone. The endpoint name
// is checked the same way, and by the same test.
func (rl *AuthRateLimiter) LimitBy(endpoint string, key KeyFunc) gin.HandlerFunc {
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
		ip := key(c)
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
			// Когда освободится место: самая старая попытка в окне выйдет из
			// него. Без заголовка клиент может только гадать — и приложение
			// повторяет сразу, продлевая собственный запрет.
			retryAfter := int(math.Ceil(valid[0].Add(cfg.window).Sub(now).Seconds()))
			if retryAfter < 1 {
				retryAfter = 1
			}
			c.Header("Retry-After", strconv.Itoa(retryAfter))
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
