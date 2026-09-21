//go:build integration

// Проверяется на живой базе намеренно: sqlmock не знает, что support_conversations.id
// — это uuid, и не откажет на "1" так, как откажет настоящий Postgres
// ("invalid input syntax for type uuid"). Именно эта ошибка, а не
// sql.ErrNoRows, была тем, что превращало ссылку на несуществующее
// обращение в 500 вместо 404 — sqlmock этого не различает, а живая база
// различает всегда.
package support

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/testsupport"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// curatorEngineOnRealDB is setupCuratorHandler's real-database twin.
func curatorEngineOnRealDB(t *testing.T, prefix string) *gin.Engine {
	t.Helper()
	db := testsupport.SchemaWithMigrations(t, prefix)
	service := NewService(db.DB, logger.New(), &fakeAnswerer{}, &fakeSender{}, &fakeLeads{}, 100)
	h := NewHandler(&config.Config{}, logger.New(), service)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", int64(1)) })
	r.GET("/curator/support/conversations/:id", h.Messages)
	r.POST("/curator/support/conversations/:id/reply", h.Reply)
	r.POST("/curator/support/conversations/:id/close", h.CloseConversation)
	return r
}

// Куратор, открывший ссылку на удалённое или опечатанное обращение, должен
// видеть "не найдено" на настоящей базе — не только под sqlmock, который
// разбор uuid не проверяет вовсе.
func TestMessages_MalformedIDOnRealDatabaseIsNotFound(t *testing.T) {
	r := curatorEngineOnRealDB(t, "support_thread_malformed_id")

	req := httptest.NewRequest(http.MethodGet, "/curator/support/conversations/1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusNotFound, w.Code, "тело ответа: %s", w.Body.String())
	assert.NotContains(t, w.Body.String(), "internal",
		"негодный id не должен выглядеть как внутренняя ошибка")
}

// Правильный по форме, но никогда не существовавший id — тот самый второй
// случай, который degenerate-тест не различил бы: тоже 404, но по-другому,
// через настоящий sql.ErrNoRows.
func TestMessages_WellFormedButUnknownIDOnRealDatabaseIsNotFound(t *testing.T) {
	r := curatorEngineOnRealDB(t, "support_thread_unknown_id")

	req := httptest.NewRequest(http.MethodGet,
		"/curator/support/conversations/11111111-1111-1111-1111-111111111111", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code, "тело ответа: %s", w.Body.String())
}

func TestReply_MalformedIDOnRealDatabaseIsNotFound(t *testing.T) {
	r := curatorEngineOnRealDB(t, "support_reply_malformed_id")

	req := httptest.NewRequest(http.MethodPost, "/curator/support/conversations/1/reply",
		strings.NewReader(`{"text":"ответ"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusNotFound, w.Code, "тело ответа: %s", w.Body.String())
}

func TestClose_MalformedIDOnRealDatabaseIsNotFound(t *testing.T) {
	r := curatorEngineOnRealDB(t, "support_close_malformed_id")

	req := httptest.NewRequest(http.MethodPost, "/curator/support/conversations/1/close", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusNotFound, w.Code, "тело ответа: %s", w.Body.String())
}
