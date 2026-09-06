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
	"github.com/burcev/api/internal/modules/notifications"
	"github.com/burcev/api/internal/modules/support"
	"github.com/burcev/api/internal/shared/email"
	"github.com/burcev/api/internal/shared/jobs"
	"github.com/burcev/api/internal/shared/middleware"
)

// Retention of job history. Long enough to answer "has this been failing all
// week?", short enough that the table stays small.
const historyRetention = 30 * 24 * time.Hour

// deliveryHistoryRetention is how long a delivery record answers "was this
// person told, and how". Beyond that it is only taking up space.
const deliveryHistoryRetention = 90 * 24 * time.Hour

// deadSubscriptionAge is how long a browser can go without accepting a push
// before we stop addressing it. Six months: long enough for somebody who uses
// the product seasonally, short enough that the table is not a graveyard.
const deadSubscriptionAge = 180 * 24 * time.Hour

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
	// Notifications is nil in a deployment that does not run the digest.
	Notifications *notifications.Service
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

	// Objects that survived an erasure because a bucket was unreachable at the
	// time. Without this pass, "best effort" would mean "once, and never
	// again", and somebody's photographs would stay in a bucket forever.
	registry.MustRegister(jobs.Job{
		Name:    "account.purge-files",
		RunAt:   jobs.At(5, 30),
		Period:  jobs.PeriodDaily,
		Timeout: 15 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Account.PurgeLeftoverFiles(ctx)
		},
	})

	// Export archives past their download window. Each holds a copy of a
	// person's whole account, so it is exactly the thing not to leave in a
	// bucket indefinitely.
	registry.MustRegister(jobs.Job{
		Name:    "cleanup.data-exports",
		RunAt:   jobs.At(3, 15),
		Period:  jobs.PeriodDaily,
		Timeout: 10 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Account.PurgeExpiredExports(ctx)
		},
	})

	// Spent and expired socket tickets. They live for thirty seconds; without
	// this the table keeps every one ever issued.
	registry.MustRegister(jobs.Job{
		Name:     "cleanup.ws-tickets",
		Interval: time.Hour,
		Timeout:  2 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Auth.PurgeExpiredWSTickets(ctx)
		},
	})

	// Revoked and expired refresh tokens, once reuse detection no longer needs
	// them to tell a stolen token from a concurrent tab.
	registry.MustRegister(jobs.Job{
		Name:    "cleanup.refresh-tokens",
		RunAt:   jobs.At(2, 45),
		Period:  jobs.PeriodDaily,
		Timeout: 5 * time.Minute,
		Run: func(ctx context.Context) (int, error) {
			return d.Auth.PurgeRevokedRefreshTokens(ctx)
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

	// The digest. Runs often because the wait before an email is what makes it
	// a digest — the interval only decides how late the last event in a batch
	// can be, not how many emails a person gets.
	if d.Notifications != nil {
		// Checked at least as often as the wait itself, and at most every ten
		// minutes: a digest that waits two seconds and is looked for once every
		// ten minutes waits ten minutes.
		digestInterval := d.Notifications.EmailDelay()
		if digestInterval > 10*time.Minute {
			digestInterval = 10 * time.Minute
		}
		if digestInterval < time.Second {
			digestInterval = time.Second
		}

		registry.MustRegister(jobs.Job{
			Name:     "notifications.send-digests",
			Interval: digestInterval,
			Timeout:  5 * time.Minute,
			Run: func(ctx context.Context) (int, error) {
				if !d.Notifications.DigestReady() {
					// Mail is optional. Saying nothing beats failing every ten
					// minutes in a deployment that has no SMTP.
					return 0, nil
				}
				return d.Notifications.SendDueDigests(ctx)
			},
		})

		// Push. Runs often: it is the channel that exists to arrive before
		// somebody opens the application, and a push that is ten minutes late
		// has lost most of its point.
		registry.MustRegister(jobs.Job{
			Name:     "notifications.send-pushes",
			Interval: time.Minute,
			Timeout:  2 * time.Minute,
			Run: func(ctx context.Context) (int, error) {
				if !d.Notifications.PushReady() {
					return 0, nil
				}
				return d.Notifications.SendDuePushes(ctx)
			},
		})

		registry.MustRegister(jobs.Job{
			Name:    "notifications.purge-dead-subscriptions",
			RunAt:   jobs.At(4, 45),
			Period:  jobs.PeriodDaily,
			Timeout: 5 * time.Minute,
			Run: func(ctx context.Context) (int, error) {
				purged, err := d.Notifications.PurgeDeadSubscriptions(ctx, deadSubscriptionAge)
				return int(purged), err
			},
		})

		registry.MustRegister(jobs.Job{
			Name:    "notifications.purge-deliveries",
			RunAt:   jobs.At(4, 30),
			Period:  jobs.PeriodDaily,
			Timeout: 5 * time.Minute,
			Run: func(ctx context.Context) (int, error) {
				purged, err := d.Notifications.PurgeDeliveries(ctx, deliveryHistoryRetention)
				return int(purged), err
			},
		})
	}
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
