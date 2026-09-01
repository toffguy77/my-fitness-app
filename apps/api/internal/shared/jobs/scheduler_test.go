package jobs

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/burcev/api/internal/shared/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mustJob(t *testing.T, j Job) Job {
	t.Helper()
	r := NewRegistry()
	require.NoError(t, r.Register(j))
	return j
}

// A job must declare enough to run correctly, or registration fails at startup
// rather than the mistake surfacing as silence in production.
func TestRegistry_RejectsUnrunnableJobs(t *testing.T) {
	valid := Job{
		Name:     "valid",
		Interval: time.Minute,
		Timeout:  time.Second,
		Run:      func(context.Context) (int, error) { return 0, nil },
	}

	cases := map[string]func(Job) Job{
		"no name":               func(j Job) Job { j.Name = ""; return j },
		"no run function":       func(j Job) Job { j.Run = nil; return j },
		"no timeout":            func(j Job) Job { j.Timeout = 0; return j },
		"no schedule":           func(j Job) Job { j.Interval = 0; return j },
		"both schedules":        func(j Job) Job { j.RunAt = At(3, 0); j.Period = PeriodDaily; return j },
		"run at without period": func(j Job) Job { j.Interval = 0; j.RunAt = At(3, 0); return j },
		"out of range run at":   func(j Job) Job { j.Interval = 0; j.RunAt = At(25, 0); j.Period = PeriodDaily; return j },
	}

	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			assert.Error(t, NewRegistry().Register(mutate(valid)))
		})
	}

	require.NoError(t, NewRegistry().Register(valid))
}

func TestRegistry_RejectsDuplicateNames(t *testing.T) {
	r := NewRegistry()
	job := Job{Name: "dup", Interval: time.Minute, Timeout: time.Second,
		Run: func(context.Context) (int, error) { return 0, nil }}

	require.NoError(t, r.Register(job))
	assert.Error(t, r.Register(job))
}

func TestIsDue_Interval(t *testing.T) {
	job := mustJob(t, Job{Name: "j", Interval: time.Hour, Timeout: time.Minute,
		Run: func(context.Context) (int, error) { return 0, nil }})
	now := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

	assert.True(t, isDue(job, time.Time{}, now), "a job that never ran is due")
	assert.True(t, isDue(job, now.Add(-90*time.Minute), now))
	assert.False(t, isDue(job, now.Add(-30*time.Minute), now))
}

// A daily job must run at its scheduled hour, not "24 hours after the last
// run" — otherwise every deploy would shift a nightly snapshot to a new time.
func TestIsDue_DailyAtFixedTime(t *testing.T) {
	job := mustJob(t, Job{Name: "j", RunAt: At(3, 0), Period: PeriodDaily, Timeout: time.Minute,
		Run: func(context.Context) (int, error) { return 0, nil }})

	day := func(h, m int) time.Time { return time.Date(2026, 3, 1, h, m, 0, 0, time.UTC) }

	assert.False(t, isDue(job, time.Time{}, day(2, 59)), "not yet 03:00")
	assert.True(t, isDue(job, time.Time{}, day(3, 1)), "past 03:00 and never ran today")
	assert.False(t, isDue(job, day(3, 0), day(23, 0)), "already ran today")
	assert.True(t, isDue(job, day(3, 0).AddDate(0, 0, -1), day(3, 1)), "ran yesterday, due again")
}

func TestIsDue_WeeklyOnWeekday(t *testing.T) {
	job := mustJob(t, Job{Name: "j", RunAt: At(4, 0), Period: PeriodWeekly,
		Weekday: time.Monday, Timeout: time.Minute,
		Run: func(context.Context) (int, error) { return 0, nil }})

	monday := time.Date(2026, 3, 2, 4, 30, 0, 0, time.UTC) // a Monday
	wednesday := monday.AddDate(0, 0, 2)

	assert.True(t, isDue(job, time.Time{}, monday))
	assert.False(t, isDue(job, monday, wednesday), "already ran this week")
	assert.True(t, isDue(job, monday.AddDate(0, 0, -7), monday), "ran last week")
}

// The whole point of the advisory lock: with several instances, the work
// happens once. The instance that loses records a skipped run so "did anything
// run here?" still has an answer.
func TestExecute_SkipsWhenLockHeldElsewhere(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("pg_try_advisory_lock").
		WillReturnRows(sqlmock.NewRows([]string{"pg_try_advisory_lock"}).AddRow(false))
	mock.ExpectExec("INSERT INTO job_runs").
		WillReturnResult(sqlmock.NewResult(0, 1))

	ran := false
	job := Job{Name: "j", Interval: time.Minute, Timeout: time.Second,
		Run: func(context.Context) (int, error) { ran = true; return 0, nil }}

	NewScheduler(db, NewRegistry(), logger.New(), time.UTC).Execute(context.Background(), job)

	assert.False(t, ran, "job must not run when another instance holds the lock")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestExecute_RecordsSuccess(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("pg_try_advisory_lock").
		WillReturnRows(sqlmock.NewRows([]string{"ok"}).AddRow(true))
	mock.ExpectQuery("INSERT INTO job_runs").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("11111111-1111-1111-1111-111111111111"))
	mock.ExpectExec("UPDATE job_runs").
		WithArgs("11111111-1111-1111-1111-111111111111", StatusSuccess, 7, "").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("pg_advisory_unlock").WillReturnResult(sqlmock.NewResult(0, 1))

	job := Job{Name: "j", Interval: time.Minute, Timeout: time.Second,
		Run: func(context.Context) (int, error) { return 7, nil }}

	NewScheduler(db, NewRegistry(), logger.New(), time.UTC).Execute(context.Background(), job)

	assert.NoError(t, mock.ExpectationsWereMet())
}

// A failure must be recorded, not swallowed: a job that has been failing for a
// week should be visible without reading logs.
func TestExecute_RecordsFailure(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("pg_try_advisory_lock").
		WillReturnRows(sqlmock.NewRows([]string{"ok"}).AddRow(true))
	mock.ExpectQuery("INSERT INTO job_runs").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("22222222-2222-2222-2222-222222222222"))
	mock.ExpectExec("UPDATE job_runs").
		WithArgs("22222222-2222-2222-2222-222222222222", StatusFailed, 0, "boom").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("pg_advisory_unlock").WillReturnResult(sqlmock.NewResult(0, 1))

	job := Job{Name: "j", Interval: time.Minute, Timeout: time.Second,
		Run: func(context.Context) (int, error) { return 0, errors.New("boom") }}

	NewScheduler(db, NewRegistry(), logger.New(), time.UTC).Execute(context.Background(), job)

	assert.NoError(t, mock.ExpectationsWereMet())
}

// A job that exceeds its timeout must be cancelled and recorded as failed, and
// must release its lock — otherwise one stuck run blocks the job forever.
func TestExecute_TimeoutCancelsAndReleasesLock(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("pg_try_advisory_lock").
		WillReturnRows(sqlmock.NewRows([]string{"ok"}).AddRow(true))
	mock.ExpectQuery("INSERT INTO job_runs").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("33333333-3333-3333-3333-333333333333"))
	mock.ExpectExec("UPDATE job_runs").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("pg_advisory_unlock").WillReturnResult(sqlmock.NewResult(0, 1))

	job := Job{Name: "j", Interval: time.Minute, Timeout: 20 * time.Millisecond,
		Run: func(ctx context.Context) (int, error) {
			<-ctx.Done()
			return 0, ctx.Err()
		}}

	NewScheduler(db, NewRegistry(), logger.New(), time.UTC).Execute(context.Background(), job)

	assert.NoError(t, mock.ExpectationsWereMet(), "the lock must be released after a timeout")
}

// The lock key must be identical across processes, or two instances would take
// different locks and both run the job.
func TestLockKey_IsStableAndDistinct(t *testing.T) {
	assert.Equal(t, lockKey("curator.daily-snapshot"), lockKey("curator.daily-snapshot"))
	assert.NotEqual(t, lockKey("a"), lockKey("b"))
}

// On the first tick after a deploy every daily job is due at once. Starting all
// of them together drained the connection pool and left ordinary requests
// waiting fifteen seconds for a connection — background work must never be able
// to take the request path's connections.
func TestScheduler_RunsAtMostTwoJobsAtOnce(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	mock.MatchExpectationsInOrder(false)

	var concurrent, peak int32
	var mu sync.Mutex

	registry := NewRegistry()
	for i := 0; i < 6; i++ {
		name := fmt.Sprintf("job-%d", i)
		registry.MustRegister(Job{
			Name:     name,
			Interval: time.Minute,
			Timeout:  time.Minute,
			Run: func(context.Context) (int, error) {
				mu.Lock()
				concurrent++
				if concurrent > peak {
					peak = concurrent
				}
				mu.Unlock()

				time.Sleep(20 * time.Millisecond)

				mu.Lock()
				concurrent--
				mu.Unlock()
				return 0, nil
			},
		})
	}

	// Every job is due (no previous run), takes its lock, and records a run.
	for i := 0; i < 6; i++ {
		mock.ExpectQuery("FROM job_runs").
			WillReturnRows(sqlmock.NewRows([]string{"max"}).AddRow(nil))
		mock.ExpectQuery("pg_try_advisory_lock").
			WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(true))
		mock.ExpectQuery("INSERT INTO job_runs").
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(i + 1)))
		mock.ExpectExec("UPDATE job_runs").WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery("pg_advisory_unlock").
			WillReturnRows(sqlmock.NewRows([]string{"unlocked"}).AddRow(true))
	}

	scheduler := NewScheduler(db, registry, logger.New(), time.UTC)
	scheduler.tick(context.Background())
	scheduler.wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	assert.LessOrEqual(t, peak, int32(maxConcurrent),
		"more jobs ran at once than the pool can afford")
	assert.Positive(t, peak, "no job ran at all")
}
