package account

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/storage"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func handlerFixture(t *testing.T) (*Handler, sqlmock.Sqlmock) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	service := NewService(&database.DB{DB: db}, logger.New(), map[string]*storage.S3Client{})
	return NewHandler(service, logger.New()), mock
}

func request(t *testing.T, method, path, body string, userID any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	if userID != nil {
		c.Set("user_id", userID)
	}
	return c, w
}

func TestRequestDeletion_RequiresAuthentication(t *testing.T) {
	handler, _ := handlerFixture(t)

	c, w := request(t, http.MethodPost, "/users/me/deletion", `{"current_password":"x"}`, nil)
	handler.RequestDeletion(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestRequestDeletion_RequiresAPasswordInTheBody(t *testing.T) {
	handler, _ := handlerFixture(t)

	c, w := request(t, http.MethodPost, "/users/me/deletion", `{}`, int64(1))
	handler.RequestDeletion(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestRequestDeletion_WrongPasswordIsUnauthorized(t *testing.T) {
	handler, mock := handlerFixture(t)
	hashed, err := bcrypt.GenerateFromPassword([]byte("right"), bcrypt.MinCost)
	require.NoError(t, err)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).AddRow(string(hashed), nil))

	c, w := request(t, http.MethodPost, "/users/me/deletion", `{"current_password":"wrong"}`, int64(1))
	handler.RequestDeletion(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// The response must tell the user when the point of no return is, so the
// cancellation window is actionable rather than theoretical.
func TestRequestDeletion_ReportsTheDeadline(t *testing.T) {
	handler, mock := handlerFixture(t)
	hashed, err := bcrypt.GenerateFromPassword([]byte("right"), bcrypt.MinCost)
	require.NoError(t, err)

	mock.ExpectQuery("SELECT password, deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"password", "deletion_requested_at"}).AddRow(string(hashed), nil))
	mock.ExpectQuery("UPDATE users SET deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"deletion_requested_at"}).AddRow(time.Now()))
	mock.ExpectExec("UPDATE refresh_tokens").WillReturnResult(sqlmock.NewResult(0, 1))

	c, w := request(t, http.MethodPost, "/users/me/deletion", `{"current_password":"right"}`, int64(1))
	handler.RequestDeletion(c)

	require.Equal(t, http.StatusAccepted, w.Code)

	var body struct {
		Data DeletionStatus `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.True(t, body.Data.Requested)
	require.NotNil(t, body.Data.ScheduledFor)
}

func TestCancelDeletion_WithoutARequestIsNotFound(t *testing.T) {
	handler, mock := handlerFixture(t)

	mock.ExpectExec("UPDATE users SET deletion_requested_at = NULL").
		WillReturnResult(sqlmock.NewResult(0, 0))

	c, w := request(t, http.MethodDelete, "/users/me/deletion", "", int64(1))
	handler.CancelDeletion(c)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetDeletionStatus_ReportsNoPendingDeletion(t *testing.T) {
	handler, mock := handlerFixture(t)

	mock.ExpectQuery("SELECT deletion_requested_at").
		WillReturnRows(sqlmock.NewRows([]string{"deletion_requested_at"}).AddRow(nil))

	c, w := request(t, http.MethodGet, "/users/me/deletion", "", int64(1))
	handler.GetDeletionStatus(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"requested":false`)
}

func TestRequestExport_ConflictWhileOneIsBuilding(t *testing.T) {
	handler, mock := handlerFixture(t)

	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	c, w := request(t, http.MethodPost, "/users/me/export", "", int64(1))
	handler.RequestExport(c)

	assert.Equal(t, http.StatusConflict, w.Code)
}

func TestRequestExport_TooManyPerDay(t *testing.T) {
	handler, mock := handlerFixture(t)

	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	c, w := request(t, http.MethodPost, "/users/me/export", "", int64(1))
	handler.RequestExport(c)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}

func TestListExports_ReturnsAnEmptyListNotNull(t *testing.T) {
	handler, mock := handlerFixture(t)

	mock.ExpectQuery("FROM data_exports").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "status", "requested_at", "completed_at", "expires_at", "downloaded",
		}))

	c, w := request(t, http.MethodGet, "/users/me/export", "", int64(1))
	handler.ListExports(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"exports":[]`)
}

func TestDownloadExport_AnotherUsersArchiveIsForbidden(t *testing.T) {
	handler, mock := handlerFixture(t)

	mock.ExpectQuery("SELECT user_id, status, s3_key").
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "status", "s3_key", "downloaded_at", "expires_at"}).
			AddRow(int64(999), "ready", "exports/999/a.zip", nil, time.Now().Add(time.Hour)))

	c, w := request(t, http.MethodGet, "/users/me/export/x", "", int64(1))
	c.Params = gin.Params{{Key: "id", Value: "11111111-1111-1111-1111-111111111111"}}
	handler.DownloadExport(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}
