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
	r.GET("/curator/leads", h.List)
	r.POST("/curator/leads/:id/handled", func(c *gin.Context) {
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

// ParsePage leaves Offset unclamped — only Queue's own internal clamp keeps
// an absurd offset from reaching the database. That clamp is invisible from
// here: `page` still carries the caller's raw offset when it is handed to
// response.Paginated, so the echoed "offset" in the JSON body used to be the
// number the client asked for, not the one Queue actually used. A curator
// paging past maxQueueOffset would see the same handful of rows forever
// under a climbing offset that never matches what produced them.
func TestList_ClampsTheOffsetItEchoesBack(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectQuery("SELECT COUNT").WithArgs(false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	// The clamped value must be what reaches the database too — this would
	// fail on an sqlmock argument mismatch if the handler forgot to pass the
	// clamped offset down to Queue.
	mock.ExpectQuery("FROM leads l").WithArgs(false, 20, int(maxQueueOffset)).
		WillReturnRows(queueRow("lead-1", 2, false, ""))

	req := httptest.NewRequest(http.MethodGet, "/curator/leads?offset=999999999", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var body struct {
		Data struct {
			Offset int `json:"offset"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, maxQueueOffset, body.Data.Offset)
}

func TestList_ReturnsAPageWithATotal(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectQuery("SELECT COUNT").WithArgs(false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery("FROM leads l").WithArgs(false, 20, 0).
		WillReturnRows(queueRow("lead-1", 2, false, ""))

	req := httptest.NewRequest(http.MethodGet, "/curator/leads", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "guest@example.com")
	assert.Contains(t, w.Body.String(), `"total":1`)
}

// The default view is the open queue; asking for the handled ones too must
// actually change which query runs, not just get ignored.
func TestList_IncludeHandledChangesTheQuery(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectQuery("SELECT COUNT").WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectQuery("FROM leads l").WithArgs(true, 20, 0).
		WillReturnRows(queueRow("lead-1", 2, false, ""))

	req := httptest.NewRequest(http.MethodGet, "/curator/leads?include_handled=true", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"total":2`)
}

// ParsePage already falls back to a default rather than denying data on a
// mistyped limit or offset. include_handled asks the same leniency of a
// query string boolean: an exact "== \"true\"" read every one of these as
// false, and false here reads exactly like "there are no handled leads",
// not like "you asked wrong".
func TestList_IncludeHandledParsesLeniently(t *testing.T) {
	cases := []struct {
		name  string
		query string
		want  bool
	}{
		{"the exact literal", "include_handled=true", true},
		{"a bare 1", "include_handled=1", true},
		{"uppercase", "include_handled=TRUE", true},
		{"the HTML checkbox value", "include_handled=on", true},
		{"a flag with no value at all", "include_handled", true},
		{"absent entirely", "", false},
		{"explicit false", "include_handled=false", false},
		{"gibberish falls back to the default, not to true", "include_handled=maybe", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r, _, mock := setupHandler(t)

			mock.ExpectQuery("SELECT COUNT").WithArgs(tc.want).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
			mock.ExpectQuery("FROM leads l").WithArgs(tc.want, 20, 0).
				WillReturnRows(sqlmock.NewRows([]string{
					"id", "email", "name", "sex", "birth_date", "height_cm", "weight_kg",
					"activity_level", "goal", "calories", "protein", "fat", "carbs", "water_glasses",
					"last_step", "source", "data_consent", "contact_consent",
					"handled_at", "created_at", "updated_at", "age_days", "reminder_sent", "conversation_id",
				}))

			url := "/curator/leads"
			if tc.query != "" {
				url += "?" + tc.query
			}
			req := httptest.NewRequest(http.MethodGet, url, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			require.Equal(t, http.StatusOK, w.Code)
			assert.NoError(t, mock.ExpectationsWereMet(),
				"include_handled=%v должен был дойти до Queue как %v", tc.query, tc.want)
		})
	}
}

func TestMarkHandled_MissingLeadIsNotFound(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectExec("UPDATE leads SET handled_at").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT EXISTS").WillReturnRows(
		sqlmock.NewRows([]string{"exists"}).AddRow(false))

	w := post(r, "/curator/leads/lead-1/handled", "")

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// A lead somebody else has already claimed must not read as success, or the
// curator who lost the race has no way to know someone else is already
// talking to this person.
//
// The i18n layer prefers the code over the server's own sentence (see
// apps/web/src/shared/i18n/__tests__/i18n.test.ts, "prefers the code over the
// server's own sentence") — so response.Error's generic 409 code ("conflict",
// which the dictionary shows as "Действие невозможно в текущем состоянии")
// would have reached the curator instead of this message, no matter how
// carefully the message itself was worded. Asserting the code, not just the
// body text, is what would have caught that.
//
// That machinery only pays off if the caller reaches it. LeadList.tsx used to
// swallow the response in a bare `catch`, so the code above never reached a
// screen — fixed, with its own test:
// apps/web/src/features/curator/components/__tests__/LeadList.test.tsx,
// "says a lead was already claimed, not just that marking it failed".
func TestMarkHandled_AlreadyClaimedIsConflict(t *testing.T) {
	r, _, mock := setupHandler(t)

	mock.ExpectExec("UPDATE leads SET handled_at").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT EXISTS").WillReturnRows(
		sqlmock.NewRows([]string{"exists"}).AddRow(true))

	w := post(r, "/curator/leads/lead-1/handled", "")

	assert.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, "lead_already_claimed", leadsResponseCode(t, w))
	assert.Contains(t, w.Body.String(), "уже отмечена обработанной")
	// Не "другой куратор": вторая отметка может прийти от того же самого
	// куратора, повторившего запрос после сорвавшегося ответа.
	assert.NotContains(t, w.Body.String(), "другой куратор")
}

// leadsResponseCode reads the machine-readable code out of a JSON response
// body, the same shape apps/web/src/shared/errors/apiErrors.ts reads.
func leadsResponseCode(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return body.Code
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
