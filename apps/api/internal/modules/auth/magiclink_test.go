package auth

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// setupMagicLinkRouter builds a router carrying only the magic-link request
// route, on top of the package's real handler test setup (sqlmock, no email
// service — the same "capability off" state every other handler test runs
// under).
func setupMagicLinkRouter(t *testing.T) (*gin.Engine, sqlmock.Sqlmock, func()) {
	handler, mock, cleanup := setupTestHandler(t)

	r := gin.New()
	r.POST("/auth/magic-link/request", handler.RequestMagicLink)

	return r, mock, cleanup
}

// post sends a JSON body to path on r and returns the recorded response,
// following the same request-building steps as the other handler tests in
// this package (see reset_handler_test.go).
func post(r *gin.Engine, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// Ответ обязан совпадать для существующего и несуществующего адреса, иначе
// эндпоинт превращается в проверялку наличия аккаунта.
func TestRequestMagicLinkResponseDoesNotRevealAccount(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t)
	defer cleanup()

	mock.ExpectQuery(`SELECT id FROM users WHERE email`).
		WithArgs("known@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(7)))
	mock.ExpectExec(`INSERT INTO magic_links`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	known := post(r, "/auth/magic-link/request",
		`{"email":"known@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	mock.ExpectQuery(`SELECT id FROM users WHERE email`).
		WithArgs("stranger@example.com").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec(`INSERT INTO magic_links`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	unknown := post(r, "/auth/magic-link/request",
		`{"email":"stranger@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	assert.Equal(t, known.Code, unknown.Code)
	assert.Equal(t, known.Body.String(), unknown.Body.String())
}

// Согласие должно быть дано до обработки, а обработка начинается с отправки
// письма на указанный адрес. Без согласий ссылка не выдаётся и письма нет.
func TestRequestMagicLinkRequiresConsents(t *testing.T) {
	r, _, cleanup := setupMagicLinkRouter(t)
	defer cleanup()

	w := post(r, "/auth/magic-link/request",
		`{"email":"someone@example.com","consents":{"terms_of_service":false,"privacy_policy":true,"data_processing":true}}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
