//go:build integration

package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Idempotency-Key против настоящей схемы: одновременность, истечение и
// снятие ключа держатся на первичном ключе и условиях в SQL, и подмена базы
// показала бы зелёное там, где они не работают.

type idemFixture struct {
	db     *database.DB
	store  *IdempotencyStore
	engine *gin.Engine
	calls  atomic.Int64
	// status и delay — что ответит обработчик.
	status atomic.Int64
	delay  atomic.Int64
	users  [2]int64
}

func newIdemFixture(t *testing.T) *idemFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)
	f := &idemFixture{db: testsupport.SchemaWithMigrations(t, "idempotency")}
	f.store = NewIdempotencyStore(f.db)
	f.status.Store(http.StatusCreated)

	for i := range f.users {
		require.NoError(t, f.db.QueryRowContext(context.Background(),
			`INSERT INTO users (email, password, name, role) VALUES ($1, 'x', 'U', 'client') RETURNING id`,
			fmt.Sprintf("idem-%d@example.test", i)).Scan(&f.users[i]))
	}

	f.engine = gin.New()
	auth := func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.GetHeader("X-User"), 10, 64)
		c.Set("user_id", id)
		c.Next()
	}
	handler := func(c *gin.Context) {
		n := f.calls.Add(1)
		time.Sleep(time.Duration(f.delay.Load()))
		var in map[string]any
		_ = c.ShouldBindJSON(&in)
		c.JSON(int(f.status.Load()), gin.H{"status": "success", "data": gin.H{"call": n, "echo": in}})
	}
	f.engine.POST("/things", auth, f.store.Middleware(logger.New()), handler)
	f.engine.POST("/other", auth, f.store.Middleware(logger.New()), handler)
	f.engine.POST("/cancelling", auth, f.store.Middleware(logger.New()), func(c *gin.Context) {
		f.calls.Add(1)
		// Соединение оборвалось после записи, до ответа: контекст запроса
		// отменён, а ответ всё равно должен лечь под ключ.
		c.Request.Context().Value(cancelKey{}).(context.CancelFunc)()
		c.JSON(http.StatusCreated, gin.H{"status": "success"})
	})
	return f
}

type cancelKey struct{}

func (f *idemFixture) send(t *testing.T, path string, user int64, key, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User", strconv.FormatInt(user, 10))
	if key != "" {
		req.Header.Set(IdempotencyKeyHeader, key)
	}
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, req)
	return w
}

func (f *idemFixture) keys(t *testing.T) int {
	t.Helper()
	var n int
	require.NoError(t, f.db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM idempotency_keys`).Scan(&n))
	return n
}

func errorCode(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body), w.Body.String())
	code, _ := body["code"].(string)
	return code
}

func TestIdempotencyIntegration(t *testing.T) {
	f := newIdemFixture(t)
	alice, bob := f.users[0], f.users[1]

	t.Run("повтор с тем же ключом и телом возвращает первый ответ", func(t *testing.T) {
		key := uuid.NewString()
		before := f.calls.Load()
		first := f.send(t, "/things", alice, key, `{"food":"Овсянка"}`)
		second := f.send(t, "/things", alice, key, `{"food":"Овсянка"}`)

		require.Equal(t, http.StatusCreated, first.Code)
		assert.Empty(t, first.Header().Get(IdempotentReplayedHeader))
		assert.Equal(t, http.StatusCreated, second.Code)
		assert.Equal(t, "true", second.Header().Get(IdempotentReplayedHeader))
		assert.Equal(t, first.Body.String(), second.Body.String(), "повтор — байт в байт первый ответ")
		assert.Equal(t, first.Header().Get("Content-Type"), second.Header().Get("Content-Type"))
		assert.Equal(t, before+1, f.calls.Load(), "действие выполнено один раз")
	})

	t.Run("тот же ключ с другим телом — 422 conflict", func(t *testing.T) {
		key := uuid.NewString()
		require.Equal(t, http.StatusCreated, f.send(t, "/things", alice, key, `{"food":"Овсянка"}`).Code)
		before := f.calls.Load()

		w := f.send(t, "/things", alice, key, `{"food":"Гречка"}`)
		assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
		assert.Equal(t, "conflict", errorCode(t, w))
		assert.Equal(t, before, f.calls.Load(), "другое тело не выполняется")
	})

	t.Run("тот же ключ на другом пути — 422 conflict", func(t *testing.T) {
		key := uuid.NewString()
		require.Equal(t, http.StatusCreated, f.send(t, "/things", alice, key, `{}`).Code)
		w := f.send(t, "/other", alice, key, `{}`)
		assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
		assert.Equal(t, "conflict", errorCode(t, w))
	})

	t.Run("без заголовка таблица ключей не меняется", func(t *testing.T) {
		before, calls := f.keys(t), f.calls.Load()
		for i := 0; i < 2; i++ {
			w := f.send(t, "/things", alice, "", `{"food":"Овсянка"}`)
			require.Equal(t, http.StatusCreated, w.Code)
			assert.Empty(t, w.Header().Get(IdempotentReplayedHeader))
		}
		assert.Equal(t, before, f.keys(t))
		assert.Equal(t, calls+2, f.calls.Load())
	})

	t.Run("ключ одного пользователя не влияет на другого", func(t *testing.T) {
		key := uuid.NewString()
		before := f.calls.Load()
		a := f.send(t, "/things", alice, key, `{"food":"Овсянка"}`)
		b := f.send(t, "/things", bob, key, `{"food":"Гречка"}`)
		assert.Equal(t, http.StatusCreated, a.Code)
		assert.Equal(t, http.StatusCreated, b.Code, "чужой ключ не даёт 422")
		assert.Empty(t, b.Header().Get(IdempotentReplayedHeader), "и не отдаёт чужой ответ")
		assert.Equal(t, before+2, f.calls.Load())
	})

	t.Run("одновременный дубль не выполняется второй раз", func(t *testing.T) {
		f.delay.Store(int64(300 * time.Millisecond))
		defer f.delay.Store(0)
		key := uuid.NewString()
		before := f.calls.Load()

		var wg sync.WaitGroup
		results := make([]*httptest.ResponseRecorder, 4)
		for i := range results {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				results[i] = f.send(t, "/things", alice, key, `{"food":"Овсянка"}`)
			}(i)
		}
		wg.Wait()

		assert.Equal(t, before+1, f.calls.Load(), "обработчик выполнен один раз")
		replayed := 0
		for _, w := range results {
			require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
			assert.Equal(t, results[0].Body.String(), w.Body.String())
			if w.Header().Get(IdempotentReplayedHeader) == "true" {
				replayed++
			}
		}
		assert.Equal(t, len(results)-1, replayed, "все, кроме первого, — повторы")
	})

	t.Run("дубль, не дождавшийся первого, получает 409 с Retry-After", func(t *testing.T) {
		key := uuid.NewString()
		_, err := f.db.ExecContext(context.Background(),
			`INSERT INTO idempotency_keys (user_id, key, method, path, body_hash) VALUES ($1, $2, 'POST', '/things', $3)`,
			alice, key, hashOf(`{}`))
		require.NoError(t, err)

		short := &IdempotencyStore{db: f.db, wait: 200 * time.Millisecond, poll: 50 * time.Millisecond, staleAfter: time.Minute}
		engine := gin.New()
		engine.POST("/things", func(c *gin.Context) { c.Set("user_id", alice); c.Next() },
			short.Middleware(logger.New()), func(c *gin.Context) { t.Error("обработчик не должен выполняться") })
		req := httptest.NewRequest(http.MethodPost, "/things", strings.NewReader(`{}`))
		req.Header.Set(IdempotencyKeyHeader, key)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		assert.Equal(t, http.StatusConflict, w.Code)
		assert.Equal(t, "conflict", errorCode(t, w))
		assert.Equal(t, "1", w.Header().Get("Retry-After"))
	})

	t.Run("брошенный запрос «в работе» не держит ключ вечно", func(t *testing.T) {
		key := uuid.NewString()
		_, err := f.db.ExecContext(context.Background(),
			`INSERT INTO idempotency_keys (user_id, key, method, path, body_hash, created_at)
			 VALUES ($1, $2, 'POST', '/things', $3, NOW() - INTERVAL '3 minutes')`,
			alice, key, hashOf(`{}`))
		require.NoError(t, err)
		before := f.calls.Load()

		w := f.send(t, "/things", alice, key, `{}`)
		assert.Equal(t, http.StatusCreated, w.Code)
		assert.Empty(t, w.Header().Get(IdempotentReplayedHeader))
		assert.Equal(t, before+1, f.calls.Load())
	})

	t.Run("ответ старше суток не повторяется — ключ свободен", func(t *testing.T) {
		key := uuid.NewString()
		_, err := f.db.ExecContext(context.Background(),
			`INSERT INTO idempotency_keys (user_id, key, method, path, body_hash, status, content_type, response, created_at)
			 VALUES ($1, $2, 'POST', '/things', 'other', 201, 'application/json', '{"old":true}', NOW() - INTERVAL '25 hours')`,
			alice, key)
		require.NoError(t, err)

		w := f.send(t, "/things", alice, key, `{"food":"Гречка"}`)
		assert.Equal(t, http.StatusCreated, w.Code)
		assert.Empty(t, w.Header().Get(IdempotentReplayedHeader))
		assert.NotContains(t, w.Body.String(), "old")
	})

	t.Run("ответ 5xx снимает ключ: повтор выполняется заново", func(t *testing.T) {
		f.status.Store(http.StatusInternalServerError)
		key := uuid.NewString()
		before := f.calls.Load()
		require.Equal(t, http.StatusInternalServerError, f.send(t, "/things", alice, key, `{}`).Code)
		f.status.Store(http.StatusCreated)

		w := f.send(t, "/things", alice, key, `{}`)
		assert.Equal(t, http.StatusCreated, w.Code)
		assert.Empty(t, w.Header().Get(IdempotentReplayedHeader))
		assert.Equal(t, before+2, f.calls.Load())
	})

	t.Run("обработчик без ответа не оставляет пустой успех под ключом", func(t *testing.T) {
		engine := gin.New()
		silentCalls := 0
		engine.POST("/silent", func(c *gin.Context) { c.Set("user_id", alice); c.Next() },
			f.store.Middleware(logger.New()), func(c *gin.Context) {
				silentCalls++
				_ = c.Error(errors.New("сбой, ответ напишет ErrorHandler снаружи"))
				c.Abort()
			})
		key := uuid.NewString()
		for i := 0; i < 2; i++ {
			req := httptest.NewRequest(http.MethodPost, "/silent", strings.NewReader(`{}`))
			req.Header.Set(IdempotencyKeyHeader, key)
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, req)
			assert.Empty(t, w.Header().Get(IdempotentReplayedHeader))
		}
		assert.Equal(t, 2, silentCalls, "ключ снят — повтор выполняется заново")
	})

	t.Run("ответ 4xx запоминается: повтор не выполняется", func(t *testing.T) {
		f.status.Store(http.StatusBadRequest)
		defer f.status.Store(http.StatusCreated)
		key := uuid.NewString()
		before := f.calls.Load()
		first := f.send(t, "/things", alice, key, `{}`)
		second := f.send(t, "/things", alice, key, `{}`)
		assert.Equal(t, http.StatusBadRequest, second.Code)
		assert.Equal(t, "true", second.Header().Get(IdempotentReplayedHeader))
		assert.Equal(t, first.Body.String(), second.Body.String())
		assert.Equal(t, before+1, f.calls.Load())
	})

	t.Run("ответ ложится под ключ и после обрыва соединения", func(t *testing.T) {
		key := uuid.NewString()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		req := httptest.NewRequest(http.MethodPost, "/cancelling", strings.NewReader(`{}`)).
			WithContext(context.WithValue(ctx, cancelKey{}, context.CancelFunc(cancel)))
		req.Header.Set(IdempotencyKeyHeader, key)
		req.Header.Set("X-User", strconv.FormatInt(alice, 10))
		f.engine.ServeHTTP(httptest.NewRecorder(), req)
		before := f.calls.Load()

		retry := httptest.NewRequest(http.MethodPost, "/cancelling", strings.NewReader(`{}`))
		retry.Header.Set(IdempotencyKeyHeader, key)
		retry.Header.Set("X-User", strconv.FormatInt(alice, 10))
		w := httptest.NewRecorder()
		f.engine.ServeHTTP(w, retry)
		assert.Equal(t, http.StatusCreated, w.Code)
		assert.Equal(t, "true", w.Header().Get(IdempotentReplayedHeader))
		assert.Equal(t, before, f.calls.Load())
	})
}

func TestIdempotencyPurgeExpired(t *testing.T) {
	f := newIdemFixture(t)
	ctx := context.Background()
	for _, age := range []string{"25 hours", "2 days", "23 hours", "1 minute"} {
		_, err := f.db.ExecContext(ctx,
			`INSERT INTO idempotency_keys (user_id, key, method, path, body_hash, status, created_at)
			 VALUES ($1, $2, 'POST', '/things', 'h', 201, NOW() - $3::interval)`,
			f.users[0], uuid.NewString(), age)
		require.NoError(t, err)
	}

	n, err := f.store.PurgeExpired(ctx)
	require.NoError(t, err)
	assert.Equal(t, 2, n, "удалены только строки старше суток")
	assert.Equal(t, 2, f.keys(t))
}

func hashOf(body string) string { return sha256Hex([]byte(body)) }
