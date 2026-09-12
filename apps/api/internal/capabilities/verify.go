// Package capabilities asks each configured capability whether it still works.
//
// The configuration can only say whether settings are filled in. Twice in one
// day that turned out to be a different question from whether they work: the
// mail provider stopped accepting the application password, and the model
// provider ran out of credit. Both capabilities went on reporting themselves as
// available — `/ready` said so — while every password reset and every answer
// from the support bot silently failed.
//
// Nothing here sends a message, spends money or writes anything. Each check is
// the cheapest question that distinguishes "configured" from "working": connect
// and authenticate, list one object, read the key's own state.
package capabilities

import (
	"context"
	"errors"
	"time"
)

// ErrIndeterminate says the check could not answer — not that the capability is
// broken.
//
// The difference matters. A provider that refuses to discuss the key from this
// network, or a container DNS that misbehaves for a second, tells us nothing
// about whether people can use the feature. Reporting that as a failure is how
// an alert becomes something people scroll past.
var ErrIndeterminate = errors.New("check could not answer")

// Check is one capability and the question that settles it.
type Check struct {
	// Name matches the capability name in config.Features.Map(), so a broken
	// capability and the flag that claims it is fine carry the same label.
	Name string
	// Verify returns nil when the capability answers.
	Verify func(ctx context.Context) error
}

// Reporter records an outcome. Narrow on purpose: this package raises a result,
// it does not need to know how metrics work.
type Reporter interface {
	SetCapabilityHealth(capability string, healthy bool)
}

// Logger is the subset used for reporting a broken capability.
type Logger interface {
	Warn(msg string, keysAndValues ...any)
}

// Verifier runs the checks and reports what it found.
type Verifier struct {
	checks   []Check
	report   Reporter
	log      Logger
	timeout  time.Duration
	reported map[string]bool
}

// New builds a verifier over the checks that apply to this deployment.
func New(report Reporter, log Logger, checks ...Check) *Verifier {
	return &Verifier{
		checks:   checks,
		report:   report,
		log:      log,
		timeout:  20 * time.Second,
		reported: map[string]bool{},
	}
}

// Run checks every capability and returns how many are broken.
//
// A failure here is never fatal: the point is to make it visible, not to take
// the service down because a bucket was briefly unreachable.
func (v *Verifier) Run(ctx context.Context) (broken int, err error) {
	for _, check := range v.checks {
		failure := v.attempt(ctx, check)

		// Нечего сказать — не говорим ничего: прежнее показание остаётся, и
		// тревога не поднимается на пустом месте.
		if errors.Is(failure, ErrIndeterminate) {
			continue
		}

		healthy := failure == nil
		if v.report != nil {
			v.report.SetCapabilityHealth(check.Name, healthy)
		}

		if healthy {
			// Recovery is worth a line too: otherwise the only trace of the
			// outage in the log is its beginning.
			if v.reported[check.Name] && v.log != nil {
				v.log.Warn("Capability works again", "capability", check.Name)
			}
			v.reported[check.Name] = false
			continue
		}

		broken++
		// Once per transition, not once per run: an hourly warning about the
		// same broken thing is how a log stops being read.
		if !v.reported[check.Name] && v.log != nil {
			v.log.Warn("Configured capability does not answer",
				"capability", check.Name, "error", failure.Error())
		}
		v.reported[check.Name] = true
	}

	return broken, nil
}

// attempt runs one check, retrying once.
//
// Container DNS misbehaves for a second at a time on this host — the database
// connection log is full of it. A single blip is not an outage, and an alert
// that fires on one is an alert people learn to ignore.
func (v *Verifier) attempt(ctx context.Context, check Check) error {
	var last error
	for i := range 2 {
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(3 * time.Second):
			}
		}
		checkCtx, cancel := context.WithTimeout(ctx, v.timeout)
		last = check.Verify(checkCtx)
		cancel()
		if last == nil || errors.Is(last, ErrIndeterminate) {
			return last
		}
	}
	return last
}
