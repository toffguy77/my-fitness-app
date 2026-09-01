package router

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// protection describes how a route stops one user reaching another user's data.
type protection string

const (
	// relationship: guarded by RequireClientRelationship on the route group.
	protRelationship protection = "relationship"
	// participant: the handler calls ValidateParticipant on the conversation.
	protParticipant protection = "participant"
	// owner: the service scopes every query by the authenticated user's id.
	protOwner protection = "owner"
	// role: reaching the route at all requires a privileged role, and the role
	// is allowed to see other users by design.
	protRole protection = "role"
	// public: intentionally readable without authentication.
	protPublic protection = "public"
)

// protectedRoutes is the registry every route carrying a reference to a
// potentially foreign resource must appear in, together with the mechanism that
// protects it.
//
// The point is not documentation. TestAuthorizationMatrixIsComplete walks the
// real engine and fails on any such route missing here, so a new endpoint
// cannot quietly ship without someone deciding how it is protected. The IDOR
// this registry exists to prevent was exactly that: a route added to the
// curator group whose handler lived in another module and never got the check.
var protectedRoutes = map[string]protection{
	// Curator workspace — RequireClientRelationship on /curator/clients/:id.
	"GET /api/v1/curator/clients/:id":                                   protRelationship,
	"GET /api/v1/curator/clients/:id/targets/history":                   protRelationship,
	"GET /api/v1/curator/clients/:id/tasks":                             protRelationship,
	"GET /api/v1/curator/clients/:id/weekly-plans":                      protRelationship,
	"GET /api/v1/curator/clients/:id/weekly-reports":                    protRelationship,
	"POST /api/v1/curator/clients/:id/tasks":                            protRelationship,
	"POST /api/v1/curator/clients/:id/weekly-plan":                      protRelationship,
	"PUT /api/v1/curator/clients/:id/target-weight":                     protRelationship,
	"PUT /api/v1/curator/clients/:id/water-goal":                        protRelationship,
	"PUT /api/v1/curator/clients/:id/tasks/:taskId":                     protRelationship,
	"PUT /api/v1/curator/clients/:id/weekly-plan/:planId":               protRelationship,
	"PUT /api/v1/curator/clients/:id/weekly-reports/:reportId/feedback": protRelationship,
	"DELETE /api/v1/curator/clients/:id/tasks/:taskId":                  protRelationship,
	"DELETE /api/v1/curator/clients/:id/weekly-plan/:planId":            protRelationship,

	// Chat — both participants share the endpoints, so membership is checked
	// per conversation inside each handler.
	"GET /api/v1/conversations/:id/messages":                    protParticipant,
	"POST /api/v1/conversations/:id/messages":                   protParticipant,
	"POST /api/v1/conversations/:id/read":                       protParticipant,
	"POST /api/v1/conversations/:id/upload":                     protParticipant,
	"POST /api/v1/conversations/:id/messages/:msgId/food-entry": protParticipant,

	// Resources owned by the caller: every query filters on the caller's id.
	"GET /api/v1/food-tracker/recommendations/:id":            protOwner,
	"PUT /api/v1/food-tracker/entries/:id":                    protOwner,
	"DELETE /api/v1/food-tracker/entries/:id":                 protOwner,
	"PUT /api/v1/food-tracker/user-foods/:id":                 protOwner,
	"DELETE /api/v1/food-tracker/user-foods/:id":              protOwner,
	"POST /api/v1/food-tracker/favorites/:foodId":             protOwner,
	"DELETE /api/v1/food-tracker/favorites/:foodId":           protOwner,
	"POST /api/v1/notifications/:id/read":                     protOwner,
	"PUT /api/v1/dashboard/tasks/:id":                         protOwner,
	"POST /api/v1/dashboard/tasks/:id/complete":               protOwner,
	"GET /api/v1/dashboard/weekly-reports/:reportId/feedback": protOwner,
	"GET /api/v1/content/feed/:id":                            protOwner,

	// Privileged roles that are meant to see other users' data.
	"GET /api/v1/admin/conversations/:id/messages": protRole,
	// :name is a job identifier from a fixed registry, not another user's
	// resource, and the group already requires super_admin.
	"POST /api/v1/admin/jobs/:name/run":           protRole,
	"GET /api/v1/admin/users/:id":                 protRole,
	"POST /api/v1/admin/users/:id/role":           protRole,
	"GET /api/v1/content/articles/:id":            protRole,
	"PUT /api/v1/content/articles/:id":            protRole,
	"DELETE /api/v1/content/articles/:id":         protRole,
	"POST /api/v1/content/articles/:id/publish":   protRole,
	"POST /api/v1/content/articles/:id/schedule":  protRole,
	"POST /api/v1/content/articles/:id/unpublish": protRole,
	"POST /api/v1/content/articles/:id/media":     protRole,

	// A user's own export: the id is theirs, and ownership is checked in the
	// handler before the archive is released.
	"GET /api/v1/users/me/export/:id": protOwner,

	// :provider names a sign-in service from a fixed registry, not another
	// user's resource. Starting a flow and returning from one are public by
	// necessity — the user is not signed in yet — and are protected by the PKCE
	// state check instead. Unlinking is scoped to the caller's own account.
	// Finishing an attempt the callback could not: the caller is not signed in
	// yet, and the pending attempt is identified by an HttpOnly cookie the
	// handler minted, not by anything the caller supplies.
	"POST /api/v1/auth/oauth/link":              protPublic,
	"POST /api/v1/auth/oauth/email":             protPublic,
	"GET /api/v1/auth/oauth/:provider":          protPublic,
	"GET /api/v1/auth/oauth/:provider/callback": protPublic,
	"DELETE /api/v1/auth/providers/:provider":   protOwner,

	// Public by design — drives SEO for published articles.
	"GET /api/v1/public/content/:id": protPublic,

	// The guest onboarding. :id here is a lead — but the only route carrying
	// one requires the administrative role, and every public route in this
	// group addresses its lead by a signed token instead, precisely so a
	// stranger cannot walk the table and read somebody's body measurements.
	"POST /api/v1/admin/leads/:id/handled": protRole,
}

// nonResourceParams are path parameters that address a value rather than
// somebody's record, so they carry no authorization obligation.
var nonResourceParams = map[string]bool{":date": true, ":code": true}

func routeHasResourceParam(path string) bool {
	for _, segment := range strings.Split(path, "/") {
		if strings.HasPrefix(segment, ":") && !nonResourceParams[segment] {
			return true
		}
	}
	return false
}

// A route that addresses a resource by id must have an entry stating how it is
// protected. Adding one without deciding that is what this test forbids.
func TestAuthorizationMatrixIsComplete(t *testing.T) {
	var unregistered []string
	for _, r := range testEngine(t).Routes() {
		if !routeHasResourceParam(r.Path) {
			continue
		}
		key := r.Method + " " + r.Path
		if _, ok := protectedRoutes[key]; !ok {
			unregistered = append(unregistered, key)
		}
	}

	assert.Empty(t, unregistered,
		"routes address a resource by id but are absent from protectedRoutes; "+
			"decide how each is protected and add it: %v", unregistered)
}

// The registry must not drift the other way either: an entry for a route that
// no longer exists hides the fact that coverage was lost.
func TestAuthorizationMatrixHasNoStaleEntries(t *testing.T) {
	live := map[string]bool{}
	for _, r := range testEngine(t).Routes() {
		live[r.Method+" "+r.Path] = true
	}

	var stale []string
	for key := range protectedRoutes {
		if !live[key] {
			stale = append(stale, key)
		}
	}

	assert.Empty(t, stale, "protectedRoutes names routes that no longer exist: %v", stale)
}

// signedToken mints an access token the way the auth service does, so requests
// pass RequireAuth and reach the authorization layer under test.
func signedToken(t *testing.T, userID int64, role string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.UserClaims{
		UserID: userID,
		Email:  "curator@example.com",
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	signed, err := token.SignedString([]byte("test-secret"))
	require.NoError(t, err)
	return signed
}

var pathParam = regexp.MustCompile(`:[a-zA-Z]+`)

// concreteURL turns a route pattern into a request path, using an id the
// curator under test is not assigned to.
func concreteURL(pattern string) string {
	return pathParam.ReplaceAllStringFunc(pattern, func(p string) string {
		if p == ":id" {
			return "999"
		}
		return "1"
	})
}

// Every route in the relationship group must refuse a curator who is not
// assigned to the client, and must refuse before the handler runs. Handlers are
// nil here on purpose: if any route let the request through, the test would
// panic instead of silently passing.
func TestRelationshipRoutesRejectForeignClient(t *testing.T) {
	checked := 0
	for key, kind := range protectedRoutes {
		if kind != protRelationship {
			continue
		}
		parts := strings.SplitN(key, " ", 2)
		method, pattern := parts[0], parts[1]

		t.Run(key, func(t *testing.T) {
			raw, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer func() { _ = raw.Close() }()

			// The curator has no active relationship with client 999.
			mock.ExpectQuery("curator_client_relationships").
				WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

			gin.SetMode(gin.TestMode)
			engine := New(Deps{
				Cfg:             &config.Config{Env: "test", JWTSecret: "test-secret"},
				Log:             logger.New(),
				DB:              &database.DB{DB: raw},
				AuthRateLimiter: middleware.NewAuthRateLimiter(),
			})

			req := httptest.NewRequest(method, concreteURL(pattern), nil)
			req.Header.Set("Authorization", "Bearer "+signedToken(t, 7, "coordinator"))
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, req)

			assert.Equal(t, http.StatusForbidden, w.Code,
				fmt.Sprintf("%s must reject a curator not assigned to the client", key))
		})
		checked++
	}

	require.NotZero(t, checked, "no relationship-protected routes found — registry is broken")
}
