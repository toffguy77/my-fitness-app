package auth

import (
	"context"
	"go/ast"
	"go/parser"
	"go/token"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type recordingClaimer struct {
	calls   []string
	touched leads.Attribution
}

func (r *recordingClaimer) ClaimInto(ctx context.Context, token string, userID int64) error {
	r.calls = append(r.calls, "claim:"+token)
	return nil
}

func (r *recordingClaimer) RecordFirstTouch(ctx context.Context, userID int64, a leads.Attribution) error {
	r.calls = append(r.calls, "first_touch")
	r.touched = a
	return nil
}

func contextWithCookies(cookies ...*http.Cookie) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	for _, cookie := range cookies {
		c.Request.AddCookie(cookie)
	}
	return c
}

func firstTouch(json string) *http.Cookie {
	return &http.Cookie{Name: leads.FirstTouchCookieName, Value: url.QueryEscape(json)}
}

// The lead goes first: it was saved during the visit that converted, and the
// first touch fills in only what nothing else recorded.
func TestCarryArrival_ClaimsTheLeadBeforeTheFirstTouch(t *testing.T) {
	claimer := &recordingClaimer{}
	c := contextWithCookies(firstTouch(`{"referrer":"https://dzen.ru/a/xyz","landing_page":"/content/x"}`))

	carryArrival(c, claimer, logger.New(), 42, "lead-token")

	assert.Equal(t, []string{"claim:lead-token", "first_touch"}, claimer.calls)
	assert.Equal(t, "https://dzen.ru/a/xyz", claimer.touched.Referrer)
	assert.Equal(t, "/content/x", claimer.touched.LandingPage)
}

func TestCarryArrival_RecordsTheFirstTouchWithoutALead(t *testing.T) {
	claimer := &recordingClaimer{}
	c := contextWithCookies(firstTouch(`{"utm_source":"yandex"}`))

	carryArrival(c, claimer, logger.New(), 42, "")

	assert.Equal(t, []string{"first_touch"}, claimer.calls)
	assert.Equal(t, "yandex", claimer.touched.UTMSource)
}

func TestCarryArrival_WithoutACookieRecordsNothing(t *testing.T) {
	claimer := &recordingClaimer{}

	carryArrival(contextWithCookies(), claimer, logger.New(), 42, "")

	assert.Empty(t, claimer.calls)
}

// Scenario: Повреждённая запись — регистрация не страдает.
func TestCarryArrival_IgnoresABrokenCookie(t *testing.T) {
	claimer := &recordingClaimer{}
	c := contextWithCookies(&http.Cookie{Name: leads.FirstTouchCookieName, Value: "%7Bbroken"})

	carryArrival(c, claimer, logger.New(), 42, "")

	assert.Empty(t, claimer.calls)
}

func TestCarryArrival_SurvivesWithoutLeads(t *testing.T) {
	c := contextWithCookies(firstTouch(`{"utm_source":"yandex"}`))
	assert.NotPanics(t, func() { carryArrival(c, nil, logger.New(), 42, "lead-token") })
}

// Every way into a new account carries the arrival across. The assignment of
// a curator was once forgotten on one of three paths
// (TestEveryAccountPathAssignsCurator); this holds the same line for where the
// person came from. The provider callback cannot be driven end to end without
// a provider, so the check is on the code: each handler calls carryArrival.
func TestEveryAccountPathCarriesArrival(t *testing.T) {
	found := map[string]bool{}
	fset := token.NewFileSet()
	for _, file := range []string{"handler.go", "oauth_handler.go"} {
		parsed, err := parser.ParseFile(fset, file, nil, 0)
		if !assert.NoError(t, err) {
			return
		}
		for _, d := range parsed.Decls {
			decl, ok := d.(*ast.FuncDecl)
			if !ok || decl.Recv == nil || decl.Body == nil {
				continue
			}
			ast.Inspect(decl.Body, func(n ast.Node) bool {
				if call, ok := n.(*ast.CallExpr); ok {
					if ident, ok := call.Fun.(*ast.Ident); ok && ident.Name == "carryArrival" {
						found[decl.Name.Name] = true
					}
				}
				return true
			})
		}
	}

	for _, fn := range []string{"Register", "ConsumeMagicLink", "Callback"} {
		assert.True(t, found[fn], "%s creates accounts and does not call carryArrival", fn)
	}
}
