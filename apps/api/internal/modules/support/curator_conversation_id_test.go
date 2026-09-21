package support

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupCuratorHandler wires the three id-carrying curator routes behind a
// bare gin engine backed by sqlmock, with an operator already authenticated
// — the same shape setupHandler uses for the public widget routes.
func setupCuratorHandler(t *testing.T) (*gin.Engine, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	service := NewService(db, logger.New(), &fakeAnswerer{}, &fakeSender{}, &fakeLeads{}, 100)
	h := NewHandler(&config.Config{}, logger.New(), service)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("user_id", int64(1)) })
	r.GET("/curator/support/conversations/:id", h.Messages)
	r.POST("/curator/support/conversations/:id/reply", h.Reply)
	r.POST("/curator/support/conversations/:id/close", h.CloseConversation)
	return r, mock
}

// Открыв ссылку на обращение, чей id вообще не похож на uuid — опечатка,
// стёршийся хвост адреса, — куратор должен получить "не найдено", а не
// "внутренняя ошибка": такого обращения не бывает, и это не отказ сервера.
//
// mock.ExpectationsWereMet проверяет вторую половину: запрос обязан быть
// отвергнут ДО базы. Дошедший до Postgres он получил бы не 404, а 500 —
// "invalid input syntax for type uuid" не превращается в sql.ErrNoRows.
func TestMessages_MalformedIDIsRejectedBeforeTheDatabase(t *testing.T) {
	r, mock := setupCuratorHandler(t)

	w := httptest.NewRequest(http.MethodGet, "/curator/support/conversations/1", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, w)

	assert.Equal(t, http.StatusNotFound, rec.Code,
		"негодный id должен выглядеть как отсутствующее обращение, а не как поломка")
	require.NoError(t, mock.ExpectationsWereMet(),
		"запрос с негодным id не должен был дойти до базы")
}

// Второй случай той же проверки: правильный по форме, но не существующий id
// обязан тоже вести к 404 — тем же путём, через sql.ErrNoRows, каким его уже
// сегодня обрабатывает Service.Thread. Не спутать с предыдущим тестом: там id
// негодной формы отвергается раньше, здесь — годной формы, но ничего не
// находит в базе.
func TestMessages_WellFormedButUnknownIDIsNotFound(t *testing.T) {
	r, mock := setupCuratorHandler(t)
	mock.ExpectQuery(`FROM support_conversations WHERE id`).
		WillReturnError(sql.ErrNoRows)

	w := httptest.NewRequest(http.MethodGet, "/curator/support/conversations/11111111-1111-1111-1111-111111111111", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, w)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestReply_MalformedIDIsRejectedBeforeTheDatabase(t *testing.T) {
	r, mock := setupCuratorHandler(t)

	w := httptest.NewRequest(http.MethodPost, "/curator/support/conversations/1/reply",
		strings.NewReader(`{"text":"ответ"}`))
	w.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, w)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestClose_MalformedIDIsRejectedBeforeTheDatabase(t *testing.T) {
	r, mock := setupCuratorHandler(t)

	w := httptest.NewRequest(http.MethodPost, "/curator/support/conversations/1/close", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, w)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	require.NoError(t, mock.ExpectationsWereMet())
}
