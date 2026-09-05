package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"golang.org/x/crypto/bcrypt"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setCookies runs the helper and returns every Set-Cookie header it produced.
func setCookies(t *testing.T, token string, rememberMe bool) []string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	(&Handler{}).setRefreshCookie(c, token, rememberMe)
	return recorder.Header().Values("Set-Cookie")
}

// setCookie returns the refresh cookie's header.
func setCookie(t *testing.T, token string, rememberMe bool) string {
	t.Helper()
	for _, header := range setCookies(t, token, rememberMe) {
		if strings.HasPrefix(header, refreshCookieName+"=") {
			return header
		}
	}
	return ""
}

func TestSessionMarkerIsReadableWhereTheTokenIsNot(t *testing.T) {
	var marker string
	for _, header := range setCookies(t, "a-refresh-token", true) {
		if strings.HasPrefix(header, sessionMarkerName+"=") {
			marker = header
		}
	}
	require.NotEmpty(t, marker, "the edge needs something it can see")

	// Path=/ so the frontend middleware sees it on every route — which is
	// exactly why it must carry nothing: a flag, not a credential.
	assert.Contains(t, marker, "Path=/")
	assert.NotContains(t, marker, "Path=/api/v1/auth")
	assert.Contains(t, marker, "HttpOnly")
	assert.Contains(t, marker, "Secure")
	assert.Contains(t, marker, sessionMarkerName+"=1")
}

func TestClearingTheSessionClearsBothCookies(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	(&Handler{}).clearRefreshCookie(c)

	headers := strings.Join(recorder.Header().Values("Set-Cookie"), "\n")
	// A marker left behind would send the browser to a signed-in page that
	// then bounces it straight back out.
	assert.Contains(t, headers, sessionMarkerName+"=")
	assert.Contains(t, headers, refreshCookieName+"=")
}

func TestRefreshCookieAttributes(t *testing.T) {
	header := setCookie(t, "a-refresh-token", true)
	require.NotEmpty(t, header)

	// HttpOnly is the point of the whole exercise: a refresh token in
	// localStorage is readable by anything that manages to run on the page,
	// and a stolen one is a session that outlives every password change.
	assert.Contains(t, header, "HttpOnly")
	assert.Contains(t, header, "Secure")
	// Scoped: the cookie is only ever needed to mint an access token, so it has
	// no business travelling with every request to every other route.
	assert.Contains(t, header, "Path=/api/v1/auth")
	// Lax rather than Strict: signing in through an external provider returns
	// via a cross-site redirect, and Strict would withhold the cookie on
	// exactly that navigation.
	assert.Contains(t, header, "SameSite=Lax")
	assert.Contains(t, header, "Max-Age=")
}

func TestRefreshCookieWithoutRememberMeEndsWithTheBrowser(t *testing.T) {
	header := setCookie(t, "a-refresh-token", false)

	// No Max-Age and no Expires: closing the browser ends the session, which is
	// what somebody signing in on a shared machine expects.
	assert.NotContains(t, header, "Max-Age=")
	assert.NotContains(t, header, "Expires=")
}

func TestRefreshCookieIsNotSetForAnEmptyToken(t *testing.T) {
	assert.Empty(t, setCookie(t, "", true))
}

func TestClearRefreshCookieExpiresIt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	(&Handler{}).clearRefreshCookie(c)

	header := recorder.Header().Get("Set-Cookie")
	require.NotEmpty(t, header)
	assert.True(t,
		strings.Contains(header, "Max-Age=0") || strings.Contains(header, "Max-Age=-1"),
		"the cookie must be expired, got %q", header)
	assert.Contains(t, header, "Path=/api/v1/auth")
}

func TestRefreshPrefersTheCookieOverTheBody(t *testing.T) {
	// During the migration a client sends both for one release. The cookie is
	// the one we want to keep working, so it wins.
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", strings.NewReader(
		`{"refresh_token":"from-the-body"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "from-the-cookie"})

	fromCookie, _ := c.Cookie(refreshCookieName)
	assert.Equal(t, "from-the-cookie", fromCookie)
}

// The helper being right is not the same as the handlers calling it. Every
// endpoint that establishes a session has to set the cookie, or the browser
// gets a token in the response body and nothing that survives a reload.
func TestLoginSetsTheSessionCookie(t *testing.T) {
	handler, mock, cleanup := setupTestHandler(t)
	defer cleanup()

	hashed, err := bcrypt.GenerateFromPassword([]byte("Password123!"), bcrypt.MinCost)
	require.NoError(t, err)

	mock.ExpectQuery("SELECT id, email").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "email", "name", "password", "role", "email_verified",
			"onboarding_completed", "created_at", "deletion_requested_at", "token_version",
		}).AddRow(1, "user@example.com", "User", string(hashed), "client", true, true,
			time.Now(), nil, 0))
	mock.ExpectExec("INSERT INTO refresh_tokens").WillReturnResult(sqlmock.NewResult(1, 1))

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/login", handler.Login)

	request := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(
		`{"email":"user@example.com","password":"Password123!"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	headers := strings.Join(recorder.Header().Values("Set-Cookie"), "\n")
	assert.Contains(t, headers, refreshCookieName+"=",
		"a login that sets no cookie leaves a session that cannot survive a reload")
	assert.Contains(t, headers, sessionMarkerName+"=",
		"without the marker the edge sends the signed-in person back to the sign-in page")
}
