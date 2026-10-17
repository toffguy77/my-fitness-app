//go:build integration

package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/modules/chat"
	foodtracker "github.com/burcev/api/internal/modules/food-tracker"
	"github.com/burcev/api/internal/shared/curatoraccess"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/burcev/api/internal/shared/ws"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Idempotency-Key через настоящий роутер и настоящие обработчики: тест самого
// middleware не скажет, повешен ли он на маршрут, а замена строки в
// регистрации однажды уже молча не сработала.

type idemRouterFixture struct {
	engine       *gin.Engine
	f            accessFixture
	foodID       string
	conversation string
}

func newIdemRouterFixture(t *testing.T) idemRouterFixture {
	t.Helper()
	ctx := context.Background()
	gin.SetMode(gin.TestMode)

	db := testsupport.SchemaWithMigrations(t, "router_idempotency")
	log := logger.New()

	var curatorID, clientID int64
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('idem-curator@example.test', 'x', 'Куратор', 'coordinator', true) RETURNING id`).Scan(&curatorID))
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO users (email, password, name, role, email_verified)
		 VALUES ('idem-client@example.test', 'x', 'Клиент', 'client', true) RETURNING id`).Scan(&clientID))
	var conversation string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO conversations (client_id, curator_id) VALUES ($1, $2) RETURNING id`,
		clientID, curatorID).Scan(&conversation))
	var foodID string
	require.NoError(t, db.QueryRowContext(ctx,
		`INSERT INTO food_items (name, category, calories_per_100, protein_per_100, fat_per_100, carbs_per_100)
		 VALUES ('Овсянка', 'grains', 380, 12, 6, 65) RETURNING id`).Scan(&foodID))

	cfg := &config.Config{Env: "test", JWTSecret: "test-secret"}
	engine := New(Deps{
		Cfg:             cfg,
		Log:             log,
		DB:              db,
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
		Chat:            chat.NewHandler(cfg, log, db, chat.NewService(db, log), nil, ws.NewHub()),
		FoodTracker:     foodtracker.NewHandler(cfg, log, db, nil, nil, foodtracker.NewService(db, log)),
	})

	f := accessFixture{engine: engine, db: db, curatorID: curatorID, clientID: clientID, conversation: conversation}
	future := time.Now().Add(30 * 24 * time.Hour)
	f.link(t, curatoraccess.StatusActive, &future)
	return idemRouterFixture{engine: engine, f: f, foodID: foodID, conversation: conversation}
}

func (x idemRouterFixture) send(t *testing.T, method, path, key, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+x.f.tokenFor(t, x.f.clientID, "client"))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set(middleware.IdempotencyKeyHeader, key)
	}
	w := httptest.NewRecorder()
	x.engine.ServeHTTP(w, req)
	return w
}

func (x idemRouterFixture) count(t *testing.T, query string) int {
	t.Helper()
	var n int
	require.NoError(t, x.f.db.QueryRowContext(context.Background(), query).Scan(&n))
	return n
}

func (x idemRouterFixture) entryBody(name string) string {
	return `{"foodId":"` + x.foodID + `","foodName":"` + name + `","mealType":"breakfast","portionType":"grams",` +
		`"portionAmount":100,"time":"08:00","date":"2026-10-17"}`
}

func TestIdempotentFoodEntry_ДвойнаяОтправкаСоздаётОднуЗапись(t *testing.T) {
	x := newIdemRouterFixture(t)
	key := uuid.NewString()

	first := x.send(t, http.MethodPost, "/api/v1/food-tracker/entries", key, x.entryBody("Овсянка"))
	require.Equal(t, http.StatusCreated, first.Code, first.Body.String())
	second := x.send(t, http.MethodPost, "/api/v1/food-tracker/entries", key, x.entryBody("Овсянка"))

	assert.Equal(t, 1, x.count(t, `SELECT COUNT(*) FROM food_entries`), "создана одна запись")
	assert.Equal(t, first.Code, second.Code)
	assert.Equal(t, first.Body.String(), second.Body.String(), "второй ответ совпадает с первым")
	assert.Equal(t, "true", second.Header().Get(middleware.IdempotentReplayedHeader))
	assert.Empty(t, first.Header().Get(middleware.IdempotentReplayedHeader))

	// Ключ, использованный для «Овсянки», приходит с «Гречкой».
	other := x.send(t, http.MethodPost, "/api/v1/food-tracker/entries", key, x.entryBody("Гречка"))
	assert.Equal(t, http.StatusUnprocessableEntity, other.Code)
	assert.Contains(t, other.Body.String(), `"code":"conflict"`)
	assert.Equal(t, 1, x.count(t, `SELECT COUNT(*) FROM food_entries`), "новая запись не создана")
}

func TestIdempotentFoodEntry_БезЗаголовкаКакПрежде(t *testing.T) {
	x := newIdemRouterFixture(t)

	for i := 0; i < 2; i++ {
		w := x.send(t, http.MethodPost, "/api/v1/food-tracker/entries", "", x.entryBody("Овсянка"))
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	}
	assert.Equal(t, 2, x.count(t, `SELECT COUNT(*) FROM food_entries`), "без ключа каждая отправка — запись")
	assert.Zero(t, x.count(t, `SELECT COUNT(*) FROM idempotency_keys`), "таблица ключей не меняется")
}

func TestIdempotentChatMessage_ПовторНеОтправляетВторойРаз(t *testing.T) {
	x := newIdemRouterFixture(t)
	key := uuid.NewString()
	path := "/api/v1/conversations/" + x.conversation + "/messages"

	first := x.send(t, http.MethodPost, path, key, sendBody)
	require.Equal(t, http.StatusCreated, first.Code, first.Body.String())
	second := x.send(t, http.MethodPost, path, key, sendBody)

	assert.Equal(t, 1, x.count(t, `SELECT COUNT(*) FROM messages`))
	assert.Equal(t, first.Body.String(), second.Body.String())
	assert.Equal(t, "true", second.Header().Get(middleware.IdempotentReplayedHeader))
}

// Ровно перечисленные в спеке маршруты принимают ключ: заголовок не-UUID
// отклоняет только middleware, так что 400 с его текстом и есть отпечаток
// того, что он стоит на маршруте. Остальные маршруты заголовок не замечают.
func TestIdempotencyKeyAcceptedOnExactlyTheListedRoutes(t *testing.T) {
	x := newIdemRouterFixture(t)

	var got []string
	for _, r := range x.engine.Routes() {
		if r.Method == http.MethodGet || r.Method == http.MethodOptions || r.Method == http.MethodHead {
			continue
		}
		path := strings.ReplaceAll(r.Path, "/conversations/:id", "/conversations/"+x.conversation)
		path = concreteURL(path)
		w := x.send(t, r.Method, path, "not-a-uuid", `{}`)
		if w.Code == http.StatusBadRequest && strings.Contains(w.Body.String(), "Idempotency-Key") {
			got = append(got, r.Method+" "+r.Path)
		}
	}
	sort.Strings(got)

	assert.Equal(t, []string{
		"DELETE /api/v1/food-tracker/entries/:id",
		"POST /api/v1/conversations/:id/messages",
		"POST /api/v1/dashboard/daily",
		"POST /api/v1/dashboard/tasks/:id/complete",
		"POST /api/v1/food-tracker/entries",
		"POST /api/v1/food-tracker/water",
		"PUT /api/v1/food-tracker/entries/:id",
	}, got)
}
