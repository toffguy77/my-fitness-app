package leads

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupHandler(t *testing.T) (*gin.Engine, *Service, sqlmock.Sqlmock) {
	t.Helper()
	service, mock := setupService(t)

	gin.SetMode(gin.TestMode)
	h := NewHandler(service, logger.New())

	r := gin.New()
	r.POST("/leads", h.Create)
	r.POST("/leads/step", h.UpdateStep)
	r.GET("/leads/resume", h.Resume)
	r.GET("/leads/unsubscribe", h.Unsubscribe)
	r.GET("/admin/leads", h.List)
	r.POST("/admin/leads/:id/handled", func(c *gin.Context) {
		c.Set("user_id", int64(1))
		h.MarkHandled(c)
	})
	return r, service, mock
}

func post(r *gin.Engine, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

const validBody = `{"email":"guest@example.com","consents":{"data_processing":true,"contact":true},
	"parameters":{"sex":"female","birth_date":"1990-05-01","height_cm":170,"weight_kg":65,
	"activity_level":"moderate","goal":"loss"},
	"result":{"calories":1800,"protein":120,"fat":50,"carbs":200,"water_glasses":8}}`

func TestCreate_ReturnsTheTokenTheBrowserKeeps(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO leads").
		WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).
			AddRow("lead-1", time.Now(), time.Now()))
	mock.ExpectExec("INSERT INTO user_consents").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO user_consents").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	w := post(r, "/leads", validBody)

	require.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Body.String(), "token")
	// The identifier is not what the browser gets to hold.
	assert.NotContains(t, w.Body.String(), `"token":"lead-1"`)
}

func TestCreate_RefusesWithoutTheConsent(t *testing.T) {
	r, _, mock := setupHandler(t)

	w := post(r, "/leads", `{"email":"guest@example.com","consents":{"data_processing":false}}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "согласие")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestCreate_RefusesAnAddressThatIsNotOne(t *testing.T) {
	r, _, _ := setupHandler(t)

	w := post(r, "/leads", `{"email":"не адрес","consents":{"data_processing":true}}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// The step is a hint for whoever follows up, not the visitor's data. A stale
// token must not put an error in front of somebody mid-wizard.
func TestUpdateStep_AStaleTokenIsNotAnError(t *testing.T) {
	r, _, _ := setupHandler(t)

	w := post(r, "/leads/step", `{"token":"not-a-real-token","step":"registration"}`)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "false")
}

func TestResume_ExpiredLinkSaysSo(t *testing.T) {
	r, service, _ := setupHandler(t)
	expired := signToken(service.secret, "lead-1", time.Now().Add(-time.Hour))

	req := httptest.NewRequest(http.MethodGet, "/leads/resume?token="+expired, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusGone, w.Code)
}

func TestResume_ForgedLinkIsRefused(t *testing.T) {
	r, _, _ := setupHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/leads/resume?token=lead-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// Somebody who clicked "delete my data" should be told it is gone, whether or
// not the row was still there.
func TestUnsubscribe_AlwaysReportsDeletion(t *testing.T) {
	r, service, mock := setupHandler(t)

	mock.ExpectExec("DELETE FROM leads").WillReturnResult(sqlmock.NewResult(0, 0))

	req := httptest.NewRequest(http.MethodGet,
		"/leads/unsubscribe?token="+service.ResumeToken("lead-1"), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "deleted")
}

func TestList_ReturnsAPageWithATotal(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery("FROM leads ORDER BY").WillReturnRows(leadRow("lead-1"))

	req := httptest.NewRequest(http.MethodGet, "/admin/leads", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "guest@example.com")
	assert.Contains(t, w.Body.String(), `"total":1`)
}

func TestMarkHandled_MissingLeadIsNotFound(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectExec("UPDATE leads SET handled_at").WillReturnResult(sqlmock.NewResult(0, 0))

	w := post(r, "/admin/leads/lead-1/handled", "")

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// Registering through an external provider never returns to our JavaScript, so
// the lead token has to travel as a cookie. The backend read one and nobody
// set it: everything a visitor entered before signing up through a provider
// was dropped, and they were asked for it again.
func TestCreate_SetsTheCookieTheProviderCallbackReads(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO leads").
		WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).
			AddRow("lead-1", time.Now(), time.Now()))
	mock.ExpectExec("INSERT INTO user_consents").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO user_consents").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	w := post(r, "/leads", validBody)
	require.Equal(t, http.StatusCreated, w.Code)

	var lead *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == LeadCookieName {
			lead = c
		}
	}
	require.NotNil(t, lead, "the provider sign-up path can only see cookies")

	var body struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, body.Data.Token, lead.Value,
		"the cookie and the body must carry the same claim on the lead")

	// Lax, not Strict: the callback arrives as a cross-site redirect from the
	// provider, and Strict withholds the cookie on exactly that request.
	assert.Equal(t, http.SameSiteLaxMode, lead.SameSite)
	assert.True(t, lead.HttpOnly, "script keeps its own copy; this one is for the server")
	assert.True(t, lead.Secure)
	assert.Equal(t, "/", lead.Path)
}
