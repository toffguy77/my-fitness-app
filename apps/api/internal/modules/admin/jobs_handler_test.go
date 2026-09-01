package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/jobs"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func jobsHandlerFixture(t *testing.T) (*JobsHandler, sqlmock.Sqlmock) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	registry := jobs.NewRegistry()
	require.NoError(t, registry.Register(jobs.Job{
		Name:     "test.job",
		Interval: time.Minute,
		Timeout:  time.Second,
		Run:      func(context.Context) (int, error) { return 0, nil },
	}))

	scheduler := jobs.NewScheduler(db, registry, logger.New(), time.UTC)
	return NewJobsHandler(scheduler), mock
}

func jobsRequest(method, path string, params gin.Params) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, nil)
	c.Params = params
	return c, w
}

// The list answers "is this job running, and did it succeed?" — previously
// only obtainable by reading container logs.
func TestJobsHandler_ListReportsScheduleAndLastRun(t *testing.T) {
	handler, mock := jobsHandlerFixture(t)

	finished := time.Now()
	mock.ExpectQuery("FROM job_runs").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "job_name", "started_at", "finished_at", "status", "error", "items_processed",
		}).AddRow("11111111-1111-1111-1111-111111111111", "test.job",
			finished.Add(-time.Minute), finished, "success", "", 12))

	c, w := jobsRequest(http.MethodGet, "/api/v1/admin/jobs", nil)
	handler.List(c)

	require.Equal(t, http.StatusOK, w.Code)

	var body struct {
		Data struct {
			Jobs []struct {
				Name     string `json:"name"`
				Schedule string `json:"schedule"`
				LastRun  *struct {
					Status         string `json:"status"`
					ItemsProcessed int    `json:"items_processed"`
				} `json:"last_run"`
			} `json:"jobs"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.Len(t, body.Data.Jobs, 1)
	assert.Equal(t, "test.job", body.Data.Jobs[0].Name)
	assert.Equal(t, "every 1m0s", body.Data.Jobs[0].Schedule)
	require.NotNil(t, body.Data.Jobs[0].LastRun)
	assert.Equal(t, "success", body.Data.Jobs[0].LastRun.Status)
	assert.Equal(t, 12, body.Data.Jobs[0].LastRun.ItemsProcessed)
}

// A job that has never run must be reported as such rather than omitted: that
// is exactly the state a never-wired-up collector was stuck in.
func TestJobsHandler_ListHandlesNeverRunJob(t *testing.T) {
	handler, mock := jobsHandlerFixture(t)

	mock.ExpectQuery("FROM job_runs").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "job_name", "started_at", "finished_at", "status", "error", "items_processed",
		}))

	c, w := jobsRequest(http.MethodGet, "/api/v1/admin/jobs", nil)
	handler.List(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"last_run":null`)
}

func TestJobsHandler_RunUnknownJob(t *testing.T) {
	handler, _ := jobsHandlerFixture(t)

	c, w := jobsRequest(http.MethodPost, "/api/v1/admin/jobs/nope/run",
		gin.Params{{Key: "name", Value: "nope"}})
	handler.Run(c)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// A manual trigger must not create a second concurrent execution.
func TestJobsHandler_RunRejectsWhileRunning(t *testing.T) {
	handler, mock := jobsHandlerFixture(t)

	mock.ExpectQuery("SELECT EXISTS").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	c, w := jobsRequest(http.MethodPost, "/api/v1/admin/jobs/test.job/run",
		gin.Params{{Key: "name", Value: "test.job"}})
	handler.Run(c)

	assert.Equal(t, http.StatusConflict, w.Code)
}

// The trigger exists for first population and verification, not for hammering
// an expensive job.
func TestJobsHandler_RunIsThrottled(t *testing.T) {
	handler, mock := jobsHandlerFixture(t)

	mock.ExpectQuery("SELECT EXISTS").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	// The accepted run acquires a lock in a goroutine; allow either outcome.
	mock.MatchExpectationsInOrder(false)
	mock.ExpectQuery("pg_try_advisory_lock").
		WillReturnRows(sqlmock.NewRows([]string{"ok"}).AddRow(false))
	mock.ExpectExec("INSERT INTO job_runs").WillReturnResult(sqlmock.NewResult(0, 1))

	params := gin.Params{{Key: "name", Value: "test.job"}}
	c, w := jobsRequest(http.MethodPost, "/api/v1/admin/jobs/test.job/run", params)
	handler.Run(c)
	require.Equal(t, http.StatusAccepted, w.Code)

	c2, w2 := jobsRequest(http.MethodPost, "/api/v1/admin/jobs/test.job/run", params)
	handler.Run(c2)

	assert.Equal(t, http.StatusTooManyRequests, w2.Code)
}
