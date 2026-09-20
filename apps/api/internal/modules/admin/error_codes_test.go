package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/apperrors"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func adminBody(t *testing.T, w *httptest.ResponseRecorder) struct {
	Code    string `json:"code"`
	Message string `json:"message"`
} {
	t.Helper()
	var body struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return body
}

func changeRoleRequest(t *testing.T, handler *Handler) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/admin/users/1/role",
		strings.NewReader(`{"role":"client"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: "1"}}
	handler.ChangeRole(c)
	return w
}

// Ветки этого обработчика сравнивали err.Error() со строками, которых сервис
// не возвращает: он оборачивает сентинелы («ChangeRole: not found»,
// «cannot change super_admin role: forbidden»). Совпадения не было ни разу, и
// оба случая уезжали в 500 «Не удалось изменить роль» — администратор видел
// поломку там, где сервер знал точный ответ.
func TestChangeRole_MissingUserIsNotFound(t *testing.T) {
	handler, mock := setupTestHandler(t)
	mock.changeRoleFunc = func(context.Context, int64, string) error {
		return fmt.Errorf("ChangeRole: %w", apperrors.ErrNotFound)
	}

	w := changeRoleRequest(t, handler)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestChangeRole_SuperAdminIsForbidden(t *testing.T) {
	handler, mock := setupTestHandler(t)
	mock.changeRoleFunc = func(context.Context, int64, string) error {
		return fmt.Errorf("cannot change super_admin role: %w", apperrors.ErrForbidden)
	}

	w := changeRoleRequest(t, handler)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

// Отдельный случай: последнего куратора нельзя разжаловать, потому что
// клиентов некому передать. Раньше он отвечал 409 с внутренней английской
// строкой в качестве сообщения — «cannot demote: no remaining curators to
// reassign 3 clients: forbidden», — которую читал администратор.
func TestChangeRole_LastCuratorIsNamed(t *testing.T) {
	handler, mock := setupTestHandler(t)
	mock.changeRoleFunc = func(context.Context, int64, string) error {
		return fmt.Errorf("%w: 3 клиента", ErrLastCurator)
	}

	w := changeRoleRequest(t, handler)

	require.Equal(t, http.StatusConflict, w.Code)
	body := adminBody(t, w)
	assert.Equal(t, "last_curator", body.Code)
	assert.NotContains(t, body.Message, "cannot demote",
		"внутренняя английская строка не должна доезжать до человека")
}

// Ручной запуск задачи, которая уже идёт: «уже выполняется» — это «подождите
// и посмотрите результат», а не «действие невозможно».
func TestRunJob_NamesTheRunningJob(t *testing.T) {
	handler, mock := jobsHandlerFixture(t)

	mock.ExpectQuery("SELECT EXISTS").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	c, w := jobsRequest(http.MethodPost, "/api/v1/admin/jobs/test.job/run",
		gin.Params{{Key: "name", Value: "test.job"}})
	handler.Run(c)

	require.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, "job_already_running", adminBody(t, w).Code)
}
