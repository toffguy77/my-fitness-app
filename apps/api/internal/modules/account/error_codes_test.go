package account

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// Клиент переводит код, а не серверную прозу: messageFor предпочитает код и
// выбрасывает сообщение. Значит, общий "conflict" означает, что человек
// прочитает «Действие невозможно в текущем состоянии» вместо «Удаление
// аккаунта уже запрошено» — при том, что сервер знал и написал ровно это.
func codeOf(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return body.Code
}

func TestRequestDeletion_NamesTheRepeatedRequest(t *testing.T) {
	handler, mock := handlerFixture(t)
	hashed, err := bcrypt.GenerateFromPassword([]byte("right"), bcrypt.MinCost)
	require.NoError(t, err)

	// Удаление уже запрошено: пароль верный, состояние — нет.
	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).
			AddRow(string(hashed), time.Now()))

	c, w := request(t, http.MethodPost, "/users/me/deletion", `{"current_password":"right"}`, int64(1))
	handler.RequestDeletion(c)

	require.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, "deletion_already_requested", codeOf(t, w))
}

func TestRequestExport_NamesTheExportAlreadyBeingBuilt(t *testing.T) {
	handler, mock := handlerFixture(t)

	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	c, w := request(t, http.MethodPost, "/users/me/export", "", int64(1))
	handler.RequestExport(c)

	require.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, "export_already_pending", codeOf(t, w))
}
