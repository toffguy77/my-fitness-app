package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/burcev/api/internal/shared/email"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
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
	r.POST("/auth/magic-link/consume", handler.ConsumeMagicLink)

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

	// Письмо при этом уходит на оба адреса — по одному вызову на каждый. Само
	// различие живёт только в письме (ExistingAccount выбирает вариант
	// текста), а не в ответе, который выше проверен побайтово одинаковым.
	require.Len(t, sender.calls, 2)
	assert.Equal(t, "known@example.com", sender.calls[0].UserEmail)
	assert.True(t, sender.calls[0].ExistingAccount)
	assert.Equal(t, "stranger@example.com", sender.calls[1].UserEmail)
	assert.False(t, sender.calls[1].ExistingAccount)

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

// expectNoRedeemableLink делает так, что погашающий запрос находит нулевую
// строку — ровно то, что происходит для истёкшей, уже использованной и
// поддельной ссылки: WHERE token_hash = $1 AND consumed_at IS NULL AND
// expires_at > NOW() отбраковывает все три одним и тем же способом, и
// подмена не может (и не должна) отличить их друг от друга.
func expectNoRedeemableLink(mock sqlmock.Sqlmock) {
	mock.ExpectQuery(`UPDATE magic_links`).
		WillReturnRows(sqlmock.NewRows([]string{"email", "user_id", "consents"}))
}

func TestConsumeMagicLinkRejectsExpired(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()
	expectNoRedeemableLink(mock)

	w := post(r, "/auth/magic-link/consume", `{"token":"stale"}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "запросите новую")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestConsumeMagicLinkRejectsAlreadyUsed(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()
	expectNoRedeemableLink(mock)

	w := post(r, "/auth/magic-link/consume", `{"token":"already-used"}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "запросите новую")
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Подделанный токен обязан отвечать ровно тем же, чем истёкший: иначе разница
// говорит, что такой токен когда-то выдавался.
func TestConsumeMagicLinkForgedLooksLikeExpired(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()
	expectNoRedeemableLink(mock)
	forged := post(r, "/auth/magic-link/consume", `{"token":"forged"}`)

	r2, mock2, cleanup2 := setupMagicLinkRouter(t, nil)
	defer cleanup2()
	expectNoRedeemableLink(mock2)
	expired := post(r2, "/auth/magic-link/consume", `{"token":"stale"}`)

	assert.Equal(t, expired.Code, forged.Code)
	assert.Equal(t, expired.Body.String(), forged.Body.String())
}

// Раньше отказ шёл через response.Error, и codeForStatus(400) молча
// подставлял общий code "validation" — тот же код, что и у, например, отказа
// формы регистрации по несовпадающему паролю. На клиенте messageFor различает
// причины по code, а не по message (см. apiErrors.ts): с общим "validation"
// он показывал «Проверьте введённые данные» человеку, который просто перешёл
// по письму — вводить ему было нечего. Код должен называть причину явно, и
// словарь на обеих сторонах уже знает "token_invalid" — заводить новый не
// нужно.
func TestConsumeMagicLinkRejectsExpiredWithNamedCode(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()
	expectNoRedeemableLink(mock)

	w := post(r, "/auth/magic-link/consume", `{"token":"stale"}`)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, apperrors.CodeTokenInvalid, resp["code"],
		"code должен называть причину (token_invalid), а не общий codeForStatus(400)")
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Тело без "token" (или вовсе не JSON) шло через response.Error и получало
// тот же общий code "validation", что и раньше просроченная ссылка — хотя
// текст ответа дословно совпадает с веткой ErrTokenInvalid чуть ниже. Любой
// клиент, различающий отказы по code (не только эта страница), получал бы
// неверное объяснение на входные данные, которые ему нечем было заполнить.
func TestConsumeMagicLinkMalformedBodyNamesTheSameCode(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()

	w := post(r, "/auth/magic-link/consume", `{}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, apperrors.CodeTokenInvalid, resp["code"])
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Гонка регистрации во время перехода по ссылке отвечала общим code
// "conflict" — тем же, что и десяток других случаев в этом пакете
// (`account has no password`, `deletion already requested` и так далее), у
// которых на клиенте один и тот же обобщённый перевод "Действие невозможно в
// текущем состоянии". Человек, у которого просто уже есть аккаунт на этот
// адрес, не поймёт, что делать. Код здесь свой — magic_link_account_exists —
// и не переиспользует общий CodeConflict, который остаётся как есть для
// остальных мест.
func TestConsumeMagicLinkConflictNamesItsOwnCode(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()

	mock.ExpectQuery(`UPDATE magic_links`).
		WillReturnRows(sqlmock.NewRows([]string{"email", "user_id", "consents"}).
			AddRow("known@example.com", nil, nil))
	mock.ExpectBegin()
	mock.ExpectQuery(`INSERT INTO users`).
		WillReturnError(&pgconn.PgError{Code: "23505"})
	mock.ExpectRollback()

	w := post(r, "/auth/magic-link/consume", `{"token":"good-token"}`)

	assert.Equal(t, http.StatusConflict, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, apperrors.CodeMagicLinkAccountExists, resp["code"])
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Погашение существующей ссылки на существующего пользователя выдаёт сессию
// тем же способом, что вход через внешнего провайдера (issueTokensForUser).
func TestConsumeMagicLinkIssuesSessionForExistingUser(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()

	mock.ExpectQuery(`UPDATE magic_links`).
		WillReturnRows(sqlmock.NewRows([]string{"email", "user_id", "consents"}).
			AddRow("known@example.com", int64(7), nil))
	mock.ExpectQuery("SELECT id, email").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version",
		}).AddRow(int64(7), "known@example.com", "Кто-то", "client", true, true, nowUTC(), 0))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

	w := post(r, "/auth/magic-link/consume", `{"token":"good-token"}`)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"known@example.com"`)
	assert.Contains(t, w.Body.String(), `"created":false`)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Кто-то зарегистрировался паролем, не подтвердил почту и потом вошёл по
// ссылке из письма, присланного на тот же адрес. issueTokensForUser не
// поднимает email_verified существующему аккаунту — destinationFor на
// клиенте смотрит именно на этот признак и отправил бы такого человека
// подтверждать адрес, который он только что подтвердил самим переходом по
// ссылке. Переход — не более слабое доказательство владения ящиком, чем код
// из письма; ConsumeMagicLink обязан поднять признак тут же, при выдаче
// сессии по ссылке.
func TestConsumeMagicLinkVerifiesEmailForExistingUnverifiedAccount(t *testing.T) {
	r, mock, cleanup := setupMagicLinkRouter(t, nil)
	defer cleanup()

	mock.ExpectQuery(`UPDATE magic_links`).
		WillReturnRows(sqlmock.NewRows([]string{"email", "user_id", "consents"}).
			AddRow("known@example.com", int64(7), nil))
	mock.ExpectQuery("SELECT id, email").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "role", "email_verified", "onboarding_completed", "created_at", "token_version",
		}).AddRow(int64(7), "known@example.com", "Кто-то", "client", false, true, nowUTC(), 0))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(`UPDATE users`).
		WithArgs(int64(7)).
		WillReturnResult(sqlmock.NewResult(0, 1))

	w := post(r, "/auth/magic-link/consume", `{"token":"good-token"}`)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"email_verified":true`,
		"переход по ссылке из письма доказывает владение ящиком не слабее кода подтверждения")
	assert.NoError(t, mock.ExpectationsWereMet())
}
