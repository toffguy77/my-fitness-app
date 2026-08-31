package router

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/config"
	"github.com/burcev/api/internal/shared/database"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/burcev/api/internal/shared/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func healthEngine(t *testing.T, db *sql.DB) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	return New(Deps{
		Cfg:             &config.Config{Env: "test", Version: "test-build"},
		Log:             logger.New(),
		DB:              &database.DB{DB: db},
		AuthRateLimiter: middleware.NewAuthRateLimiter(),
	})
}

func get(engine *gin.Engine, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

// Readiness must fail when a dependency is down. The previous single /health
// endpoint reported "status: ok" with HTTP 200 even while telling the caller
// the database was unhealthy, so no orchestrator ever acted on it.
func TestReady_DatabaseUnreachable(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	mock.ExpectPing().WillReturnError(assert.AnError)
	mock.ExpectPing().WillReturnError(assert.AnError)

	w := get(healthEngine(t, db), "/ready")

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, false, body["ready"])
	assert.Equal(t, "unhealthy", body["checks"].(map[string]any)["database"])
}

// Liveness must stay green while a dependency is down: restarting the process
// cannot fix an unreachable database, it only causes a crash loop.
func TestHealth_StaysUpWhenDatabaseUnreachable(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	mock.ExpectPing().WillReturnError(assert.AnError)

	w := get(healthEngine(t, db), "/health")

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestReady_AllDependenciesHealthy(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	mock.ExpectPing()

	w := get(healthEngine(t, db), "/ready")

	assert.Equal(t, http.StatusOK, w.Code)

	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, true, body["ready"])
	assert.Contains(t, body, "features")
}

// Liveness must not touch dependencies at all.
func TestHealth_DoesNotQueryDependencies(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	w := get(healthEngine(t, db), "/health")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.NoError(t, mock.ExpectationsWereMet(), "liveness must make no database calls")
}
