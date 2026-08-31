// Package jobsetup declares which periodic jobs this service runs.
//
// It is deliberately the only place that knows the full list. Previously
// starting a job meant editing main(), and two functions that had been written
// and unit-tested — CollectDailySnapshot and CleanupOldAttempts — were never
// called, so curator analytics stayed permanently empty and the password-reset
// attempts table grew without bound.
package jobsetup

import (
	"context"
	"time"

	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/modules/content"
	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/shared/jobs"
	"github.com/burcev/api/internal/shared/middleware"
)

// Retention of job history. Long enough to answer "has this been failing all
// week?", short enough that the table stays small.
const historyRetention = 30 * 24 * time.Hour

// Deps are the services the jobs act on.
type Deps struct {
	Account     *account.Service
	Content     *content.Service
	Curator     *curator.Service
	RateLimiter *middleware.RateLimiter
	Scheduler   *jobs.Scheduler
}

// Register declares every periodic job. It panics on an invalid declaration:
// a misconfigured job should stop the process at startup rather than quietly
// never run.
func Register(registry *jobs.Registry, d Deps) {
	// Publishing scheduled articles. Minute granularity because an author
	// picking a publish time expects it to be honoured to the minute.
	registry.MustRegister(jobs.Job{
		Name:     "content.publish-scheduled",
		Interval: time.Minute,
		Timeout:  30 * time.Second,
		Run: func(ctx context.Context) (int, error) {
			return 0, d.Content.PublishScheduledArticles(ctx)
		},
	})

	// Curator analytics. Runs after the day has ended, in Moscow time, so a
	// snapshot covers a whole day rather than an arbitrary window that shifts
	// with every deploy.
	registry.MustRegister(jobs.Job{
		Name:    "curator.daily-snapshot",
		RunAt:   jobs.At(3, 0),
		Period:  jobs.PeriodDaily,
		Timeout: 5 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Curator.CollectAllDailySnapshots(ctx)
		},
	})

	// Weekly snapshots and the platform benchmark, for the week that just
	// ended. Monday morning, after the daily job.
	registry.MustRegister(jobs.Job{
		Name:    "curator.weekly-snapshot",
		RunAt:   jobs.At(4, 0),
		Period:  jobs.PeriodWeekly,
		Weekday: time.Monday,
		Timeout: 10 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Curator.CollectAllWeeklySnapshots(ctx)
		},
	})

	// Password reset attempts back the rate limiter. CleanupOldAttempts existed
	// but nothing called it, so the table grew for the lifetime of the service.
	registry.MustRegister(jobs.Job{
		Name:    "cleanup.password-reset-attempts",
		RunAt:   jobs.At(2, 0),
		Period:  jobs.PeriodDaily,
		Timeout: 2 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.RateLimiter.CleanupOldAttempts(ctx)
		},
	})

	// Building an archive with a year of photographs cannot happen inside an
	// HTTP request, so it happens here.
	registry.MustRegister(jobs.Job{
		Name:     "account.build-exports",
		Interval: time.Minute,
		Timeout:  10 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Account.BuildPendingExports(ctx)
		},
	})

	// Irreversible erasure of accounts whose cancellation window has closed.
	registry.MustRegister(jobs.Job{
		Name:    "account.execute-deletions",
		RunAt:   jobs.At(5, 0),
		Period:  jobs.PeriodDaily,
		Timeout: 30 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Account.ExecuteDueDeletions(ctx)
		},
	})

	// Job history itself needs pruning, or the audit trail becomes the problem.
	registry.MustRegister(jobs.Job{
		Name:    "cleanup.job-runs",
		RunAt:   jobs.At(2, 30),
		Period:  jobs.PeriodDaily,
		Timeout: 2 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Scheduler.PurgeHistory(ctx, historyRetention)
		},
	})
}
