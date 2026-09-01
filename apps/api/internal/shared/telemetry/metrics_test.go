package telemetry

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func scrape(t *testing.T, m *Metrics) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.GET("/metrics", m.Handler())

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	require.Equal(t, http.StatusOK, w.Code)
	return w.Body.String()
}

// Labelling by concrete path would create one time series per id and make the
// metric useless. The route template is what belongs in the label.
func TestMiddleware_LabelsByRouteTemplateNotPath(t *testing.T) {
	m := New("test", nil)

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(m.Middleware())
	engine.GET("/users/:id", func(c *gin.Context) { c.Status(http.StatusOK) })

	for _, id := range []string{"1", "2", "3"} {
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/users/"+id, nil))
	}

	body := scrape(t, m)
	assert.Contains(t, body, `route="/users/:id"`)
	assert.NotContains(t, body, `route="/users/1"`)
}

// An unmatched request must not become its own series either: an attacker
// probing random URLs would otherwise grow the metric without bound.
func TestMiddleware_BucketsUnmatchedRoutes(t *testing.T) {
	m := New("test", nil)

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(m.Middleware())

	for _, path := range []string{"/nope", "/also-nope", "/wat"} {
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	}

	body := scrape(t, m)
	assert.Contains(t, body, `route="unmatched"`)
	assert.NotContains(t, body, `route="/nope"`)
}

func TestMiddleware_RecordsStatus(t *testing.T) {
	m := New("test", nil)

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(m.Middleware())
	engine.GET("/boom", func(c *gin.Context) { c.Status(http.StatusInternalServerError) })

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))

	assert.Contains(t, scrape(t, m), `status="500"`)
}

// Gauges must read the pool at scrape time; a snapshot taken at startup would
// report the same numbers forever.
func TestPoolGauges_ReadCurrentValues(t *testing.T) {
	inUse := 3
	m := New("test", func() sql.DBStats {
		return sql.DBStats{OpenConnections: 5, InUse: inUse, Idle: 2, WaitCount: 7}
	})

	assert.Contains(t, scrape(t, m), "test_db_connections_in_use 3")

	inUse = 9
	assert.Contains(t, scrape(t, m), "test_db_connections_in_use 9")
}

func TestObserveJob_RecordsOutcome(t *testing.T) {
	m := New("test", nil)

	m.ObserveJob("curator.daily-snapshot", "success", 2*time.Second)
	m.ObserveJob("curator.daily-snapshot", "failed", time.Second)

	body := scrape(t, m)
	assert.Contains(t, body, `job="curator.daily-snapshot",status="success"`)
	assert.Contains(t, body, `job="curator.daily-snapshot",status="failed"`)
}

func TestRecordEvent_CountsDomainEvents(t *testing.T) {
	m := New("test", nil)

	m.RecordEvent(EventUserRegistered)
	m.RecordEvent(EventUserRegistered)
	m.RecordEvent(EventLoginFailed)

	body := scrape(t, m)
	assert.True(t, strings.Contains(body, `event="user_registered"} 2`), body)
	assert.Contains(t, body, `event="login_failed"} 1`)
}

// The counters were declared and never incremented: the dashboard would have
// shown zero registrations forever. Installing the recorder is what connects
// the services to them.
func TestRecord_CountsThroughTheDefaultRecorder(t *testing.T) {
	metrics := New("test_default", nil)
	SetDefault(metrics)
	t.Cleanup(func() { SetDefault(nil) })

	Record(EventUserRegistered)
	Record(EventUserRegistered)
	Record(EventLoginFailed)

	body := scrape(t, metrics)
	assert.Contains(t, body, `test_default_domain_events_total{event="user_registered"} 2`)
	assert.Contains(t, body, `test_default_domain_events_total{event="login_failed"} 1`)
}

// A service must not need a metrics registry to be usable — in a test, or in a
// process that never installed one.
func TestRecord_IsANoOpWithoutARecorder(t *testing.T) {
	SetDefault(nil)

	assert.NotPanics(t, func() { Record(EventMessageSent) })
}
