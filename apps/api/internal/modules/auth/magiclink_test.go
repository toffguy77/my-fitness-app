package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/email"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeMagicLinkSender is a MagicLinkSender that records what it was asked to
// send instead of sending anything, so a test can tell whether the letter
// went out without touching SMTP.
type fakeMagicLinkSender struct {
	calls []email.MagicLinkEmailData
}

func (f *fakeMagicLinkSender) SendMagicLink(ctx context.Context, data email.MagicLinkEmailData) error {
	f.calls = append(f.calls, data)
	return nil
}

// setupMagicLinkRouter builds a router carrying only the magic-link request
// route, on top of the package's real handler test setup (sqlmock). A nil
// sender leaves the service's email capability off, same as every other
// handler test in this package; a non-nil one attaches it via
// Service.WithEmailService, reaching through the unexported handler field —
// same package, so that is a plain field access, not a hack.
func setupMagicLinkRouter(t *testing.T, sender MagicLinkSender) (*gin.Engine, sqlmock.Sqlmock, func()) {
	handler, mock, cleanup := setupTestHandler(t)
	if sender != nil {
		handler.service.WithEmailService(sender)
	}

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
// эндпоинт превращается в проверялку наличия аккаунта. Проверяется это на
// успешном пути — с почтой, которая действительно способна отправить письмо, —
// а не на пути, где почта выключена и оба ответа совпадают по любой причине.
func TestRequestMagicLinkResponseDoesNotRevealAccount(t *testing.T) {
	sender := &fakeMagicLinkSender{}
	r, mock, cleanup := setupMagicLinkRouter(t, sender)
	defer cleanup()

	mock.ExpectQuery(`SELECT id FROM users WHERE LOWER`).
		WithArgs("known@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(7)))
	mock.ExpectExec(`INSERT INTO magic_links`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	known := post(r, "/auth/magic-link/request",
		`{"email":"known@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	mock.ExpectQuery(`SELECT id FROM users WHERE LOWER`).
		WithArgs("stranger@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectExec(`INSERT INTO magic_links`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	unknown := post(r, "/auth/magic-link/request",
		`{"email":"stranger@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	require.Equal(t, http.StatusOK, known.Code)

	// Ядро требования: по коду ответа и по телу нельзя понять, у кого из двух
	// был аккаунт, а у кого не было.
	assert.Equal(t, known.Code, unknown.Code)
	assert.Equal(t, known.Body.String(), unknown.Body.String())

	// Письмо при этом уходит на оба адреса — по одному вызову на каждый.
	require.Len(t, sender.calls, 2)
	assert.Equal(t, "known@example.com", sender.calls[0].UserEmail)
	assert.Equal(t, "stranger@example.com", sender.calls[1].UserEmail)

	assert.NoError(t, mock.ExpectationsWereMet())
}

// Согласие должно быть дано до обработки, а обработка начинается с отправки
// письма на указанный адрес. Без согласий ссылка не выдаётся и письма нет.
func TestRequestMagicLinkRequiresConsents(t *testing.T) {
	sender := &fakeMagicLinkSender{}
	r, mock, cleanup := setupMagicLinkRouter(t, sender)
	defer cleanup()

	w := post(r, "/auth/magic-link/request",
		`{"email":"someone@example.com","consents":{"terms_of_service":false,"privacy_policy":true,"data_processing":true}}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Empty(t, sender.calls, "без согласий письмо не должно уйти")
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Отдельное требование от неразличимости: когда способность email выключена
// (сендер не подставлен), запрос отказывает явно — 503 и подсказка войти по
// паролю, а не тихо теряет ссылку.
func TestRequestMagicLinkWhenEmailDisabled(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()

	mock.ExpectQuery(`SELECT id FROM users WHERE LOWER`).
		WithArgs("a@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectExec(`INSERT INTO magic_links`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	w := post(r, "/auth/magic-link/request",
		`{"email":"a@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Contains(t, w.Body.String(), "войдите по паролю")
	assert.NoError(t, mock.ExpectationsWereMet())
}
