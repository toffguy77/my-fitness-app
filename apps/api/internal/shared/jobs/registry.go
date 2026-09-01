// Package jobs runs periodic background work.
//
// It exists because the previous arrangement — one goroutine with a ticker,
// started by hand from main() — had three problems. A second instance would run
// the same work twice. Nothing recorded whether a job ran, so a silently broken
// job was indistinguishable from one that had nothing to do. And adding a job
// meant editing main(), which is why two written-and-tested functions
// (CollectDailySnapshot, CleanupOldAttempts) were never called at all.
package jobs

import (
	"context"
	"fmt"
	"sort"
	"time"
)

// Job describes one unit of periodic work.
//
// Exactly one of Interval or RunAt must be set. Interval suits maintenance that
// only needs to happen often enough; RunAt suits work tied to the calendar,
// such as a daily snapshot that must be taken after the day has ended.
type Job struct {
	// Name identifies the job in history, metrics and the advisory lock.
	Name string

	// Interval runs the job when this much time has passed since the last run.
	Interval time.Duration

	// RunAt runs the job once per period at this local time. Requires Period.
	RunAt *TimeOfDay

	// Period is the calendar unit for RunAt: PeriodDaily or PeriodWeekly.
	Period Period

	// Weekday selects the day for PeriodWeekly. Ignored otherwise.
	Weekday time.Weekday

	// Timeout bounds one execution. Mandatory: without it a stuck job would
	// hold its advisory lock and block every later run.
	Timeout time.Duration

	// Run performs the work and reports how many items it handled.
	Run func(ctx context.Context) (itemsProcessed int, err error)
}

// Period is the calendar unit used with RunAt.
type Period string

const (
	PeriodDaily  Period = "daily"
	PeriodWeekly Period = "weekly"
)

// TimeOfDay is a wall-clock time in the scheduler's location.
type TimeOfDay struct {
	Hour   int
	Minute int
}

// At is a convenience constructor for RunAt.
func At(hour, minute int) *TimeOfDay { return &TimeOfDay{Hour: hour, Minute: minute} }

// Registry holds the jobs a process will run.
type Registry struct {
	jobs map[string]Job
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{jobs: make(map[string]Job)}
}

// Register adds a job. It rejects a job that could never run correctly rather
// than letting the mistake surface as silence in production.
func (r *Registry) Register(job Job) error {
	if job.Name == "" {
		return fmt.Errorf("job name is required")
	}
	if _, exists := r.jobs[job.Name]; exists {
		return fmt.Errorf("job %q is already registered", job.Name)
	}
	if job.Run == nil {
		return fmt.Errorf("job %q has no Run function", job.Name)
	}
	if job.Timeout <= 0 {
		return fmt.Errorf("job %q must declare a timeout", job.Name)
	}
	if (job.Interval == 0) == (job.RunAt == nil) {
		return fmt.Errorf("job %q must set exactly one of Interval or RunAt", job.Name)
	}
	if job.RunAt != nil {
		if job.Period != PeriodDaily && job.Period != PeriodWeekly {
			return fmt.Errorf("job %q with RunAt must set Period to daily or weekly", job.Name)
		}
		if job.RunAt.Hour < 0 || job.RunAt.Hour > 23 || job.RunAt.Minute < 0 || job.RunAt.Minute > 59 {
			return fmt.Errorf("job %q has an out-of-range RunAt", job.Name)
		}
	}

	r.jobs[job.Name] = job
	return nil
}

// MustRegister panics on an invalid job. Intended for wiring at startup, where
// a misconfigured job should stop the process rather than run wrongly.
func (r *Registry) MustRegister(job Job) {
	if err := r.Register(job); err != nil {
		panic(err)
	}
}

// Get returns a job by name.
func (r *Registry) Get(name string) (Job, bool) {
	job, ok := r.jobs[name]
	return job, ok
}

// All returns every registered job, ordered by name for stable output.
func (r *Registry) All() []Job {
	out := make([]Job, 0, len(r.jobs))
	for _, j := range r.jobs {
		out = append(out, j)
	}
	sort.Slice(out, func(i, k int) bool { return out[i].Name < out[k].Name })
	return out
}

// Schedule renders the job's cadence for display.
func (j Job) Schedule() string {
	if j.Interval > 0 {
		return "every " + j.Interval.String()
	}
	when := fmt.Sprintf("%02d:%02d", j.RunAt.Hour, j.RunAt.Minute)
	if j.Period == PeriodWeekly {
		return fmt.Sprintf("weekly on %s at %s", j.Weekday, when)
	}
	return "daily at " + when
}
