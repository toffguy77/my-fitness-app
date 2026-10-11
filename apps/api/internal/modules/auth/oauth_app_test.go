package auth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// Вход, начатый из приложения, возвращается в приложение — с причиной, по
// которой оно подскажет человеку, что делать дальше.
func TestRedirectToAppClient(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := map[string]string{
		"/auth?oauth=cancelled":            "cancelled",
		"/auth?oauth=invalid_state":        "invalid_state",
		"/auth/link?provider=vk&email=a@b": "link_required",
		"/auth/email?provider=vk":          "email_required",
		"/something":                       "failed",
	}
	for path, reason := range cases {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/vk/callback", nil)
		redirectToAppClient(c, "https://burcev.team", path)
		assert.Equal(t, http.StatusFound, w.Code)
		location := w.Header().Get("Location")
		// Только https нашего домена: собственную схему вправе перехватить
		// любое приложение на телефоне.
		assert.True(t, strings.HasPrefix(location, "https://burcev.team"+AppCallbackPath+"?"), location)
		parsed, _ := url.Parse(location)
		assert.Equal(t, reason, parsed.Query().Get("error"), path)
	}
}

func TestAppChallengeAcceptsOnlyAHash(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for value, want := range map[string]bool{
		strings.Repeat("a", 43):       true,
		"short":                       false,
		strings.Repeat("a", 42) + "/": false,
		"https://evil.example/" + "x": false,
	} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
		c.Request.AddCookie(&http.Cookie{Name: appChallengeCookie, Value: value})
		assert.Equal(t, want, appChallenge(c) != "", value)
	}
}
