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
	"net/url"
	"time"

	"github.com/burcev/api/internal/modules/account"
	"github.com/burcev/api/internal/modules/analytics"
	"github.com/burcev/api/internal/modules/auth"
	"github.com/burcev/api/internal/modules/content"
	"github.com/burcev/api/internal/modules/curator"
	"github.com/burcev/api/internal/modules/leads"
	"github.com/burcev/api/internal/modules/support"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/jobs"
	"github.com/burcev/api/internal/shared/middleware"
)

// Retention of job history. Long enough to answer "has this been failing all
// week?", short enough that the table stays small.
const historyRetention = 30 * 24 * time.Hour

// supportEmail is where a reminder tells people to write back.
const supportEmail = "support@burcev.team"

// Deps are the services the jobs act on.
type Deps struct {
	Account   *account.Service
	Auth      *auth.Service
	Content   *content.Service
	Curator   *curator.Service
	Analytics *analytics.Service
	Leads     *leads.Service
	// Support is nil when the bot is not configured; its cleanup job then has
	// nothing to clean.
	Support *support.Service
	// Email may be nil: mail is an optional capability, and the reminder job
	// declares itself unavailable rather than failing every night.
	Email       *email.Service
	AppDomain   string
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

	// An external sign-in nobody came back to finish leaves a row holding a
	// provider profile. They expire in minutes; without this the table keeps
	// them forever.
	registry.MustRegister(jobs.Job{
		Name:    "cleanup.oauth-pending-links",
		RunAt:   jobs.At(2, 15),
		Period:  jobs.PeriodDaily,
		Timeout: 2 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			deleted, err := d.Auth.PurgeExpiredPendingLinks(ctx)
			return int(deleted), err
		},
	})

	// The single reminder to somebody who worked out their numbers and stopped
	// at the registration form. Runs hourly rather than daily so the delay is
	// roughly a day rather than "some time tomorrow".
	registry.MustRegister(jobs.Job{
		Name:     "leads.send-reminders",
		Interval: time.Hour,
		Timeout:  5 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return sendLeadReminders(ctx, d)
		},
	})

	// Support chats hold what people typed before they had accounts, so they
	// are not kept forever either.
	registry.MustRegister(jobs.Job{
		Name:    "support.purge-conversations",
		RunAt:   jobs.At(3, 45),
		Period:  jobs.PeriodDaily,
		Timeout: 5 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			if d.Support == nil {
				return 0, nil
			}
			return d.Support.PurgeOld(ctx)
		},
	})

	// Raw events past the retention period. Reports read aggregates; the rows
	// themselves stop being useful long before they stop taking space.
	registry.MustRegister(jobs.Job{
		Name:    "analytics.purge-events",
		RunAt:   jobs.At(4, 0),
		Period:  jobs.PeriodDaily,
		Timeout: 10 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Analytics.PurgeExpired(ctx)
		},
	})

	// A contact belonging to somebody who never became a user is not ours to
	// keep indefinitely.
	registry.MustRegister(jobs.Job{
		Name:    "leads.purge-expired",
		RunAt:   jobs.At(3, 30),
		Period:  jobs.PeriodDaily,
		Timeout: 5 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Leads.PurgeExpired(ctx)
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

// sendLeadReminders sends each due lead its one reminder.
//
// The send is marked only after it succeeds, and a failure is not retried: the
// lead simply ages out of the window. A dead mailbox costs one message rather
// than an hourly retry for as long as the row exists.
func sendLeadReminders(ctx context.Context, d Deps) (int, error) {
	if d.Email == nil {
		// Mail is an optional capability. Without it there is nothing to send,
		// and saying so once a run beats failing once a run.
		return 0, nil
	}

	due, err := d.Leads.DueReminders(ctx)
	if err != nil {
		return 0, err
	}

	origin := "https://" + d.AppDomain
	if d.AppDomain == "" {
		origin = "http://localhost:3069"
	}

	sent := 0
	for _, lead := range due {
		token := d.Leads.ResumeToken(lead.ID)

		data := email.OnboardingReminderData{
			UserEmail:      lead.Email,
			Name:           lead.Name,
			ResumeURL:      origin + "/onboarding?resume=" + url.QueryEscape(token),
			UnsubscribeURL: origin + "/api/v1/public/leads/unsubscribe?token=" + url.QueryEscape(token),
			SupportEmail:   supportEmail,
		}
		if lead.Result != nil {
			data.Calories = int(lead.Result.Calories)
		}

		if err := d.Email.SendOnboardingReminder(ctx, data); err != nil {
			// One failed address must not stop the rest of the run.
			continue
		}
		if err := d.Leads.MarkReminded(ctx, lead.ID); err != nil {
			return sent, err
		}
		sent++
	}

	return sent, nil
}
