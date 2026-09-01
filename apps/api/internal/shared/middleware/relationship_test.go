package middleware

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// relationshipEngine builds a route guarded by RequireClientRelationship.
// userID is injected the way RequireAuth would; pass nil for an unauthenticated
// request. handlerRan records whether the route body executed — the whole point
// of the middleware is that a denied request never reaches it.
func relationshipEngine(t *testing.T, userID any) (*gin.Engine, sqlmock.Sqlmock, *bool) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	raw, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = raw.Close() })

	handlerRan := false
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		if userID != nil {
			c.Set("user_id", userID)
		}
		c.Next()
	})

	group := engine.Group("/curator/clients/:id")
	group.Use(RequireClientRelationship(&database.DB{DB: raw}, logger.New()))
	group.GET("/targets/history", func(c *gin.Context) {
		handlerRan = true
		// The verified id must be available to handlers without re-parsing.
		assert.Equal(t, int64(42), c.GetInt64(ContextClientID))
		c.Status(http.StatusOK)
	})

	return engine, mock, &handlerRan
}

func doGet(engine *gin.Engine, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func TestRequireClientRelationship_ActiveRelationship(t *testing.T) {
	engine, mock, handlerRan := relationshipEngine(t, int64(7))
	mock.ExpectQuery("curator_client_relationships").
		WithArgs(int64(7), int64(42)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	w := doGet(engine, "/curator/clients/42/targets/history")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.True(t, *handlerRan)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRequireClientRelationship_NoRelationship(t *testing.T) {
	engine, mock, handlerRan := relationshipEngine(t, int64(7))
	mock.ExpectQuery("curator_client_relationships").
		WithArgs(int64(7), int64(999)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

	w := doGet(engine, "/curator/clients/999/targets/history")

	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.False(t, *handlerRan, "handler must not run when access is denied")
}

// An inactive relationship is indistinguishable from none: the query filters on
// status = 'active', so a revoked assignment stops granting access at once.
func TestRequireClientRelationship_InactiveRelationship(t *testing.T) {
	engine, mock, handlerRan := relationshipEngine(t, int64(7))
	mock.ExpectQuery("curator_client_relationships").
		WithArgs(int64(7), int64(42)).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

	w := doGet(engine, "/curator/clients/42/targets/history")

	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.False(t, *handlerRan)
}

func TestRequireClientRelationship_InvalidClientID(t *testing.T) {
	engine, _, handlerRan := relationshipEngine(t, int64(7))

	w := doGet(engine, "/curator/clients/abc/targets/history")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.False(t, *handlerRan)
}

func TestRequireClientRelationship_Unauthenticated(t *testing.T) {
	engine, _, handlerRan := relationshipEngine(t, nil)

	w := doGet(engine, "/curator/clients/42/targets/history")

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.False(t, *handlerRan)
}

// A failing database must deny access, never fall through to the handler.
func TestRequireClientRelationship_QueryError(t *testing.T) {
	engine, mock, handlerRan := relationshipEngine(t, int64(7))
	mock.ExpectQuery("curator_client_relationships").
		WithArgs(int64(7), int64(42)).
		WillReturnError(errors.New("connection reset"))

	w := doGet(engine, "/curator/clients/42/targets/history")

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.False(t, *handlerRan)
}
