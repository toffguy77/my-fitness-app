package jobs

import (
	"context"
	"database/sql"
	"sync"
	"time"
)

// tickInterval is how often the scheduler re-evaluates what is due. It bounds
// how late a job can start, so it must be no coarser than the shortest job
// interval in the registry.
const tickInterval = 30 * time.Second

// maxConcurrent bounds how many jobs run at once.
//
// Every running job holds a connection for its advisory lock plus at least one
// for its own queries. On the first tick after a deploy every daily job is due
// at the same moment — that is the normal state, not an edge case — and
// starting eleven of them together drained the pool and left ordinary requests
// waiting fifteen seconds for a connection. Background work must never be able
// to take the request path's connections.
const maxConcurrent = 2

// Logger is the subset of the application logger the scheduler needs.
type Logger interface {
	Info(msg string, keysAndValues ...interface{})
	Warn(msg string, keysAndValues ...interface{})
	Error(msg string, keysAndValues ...interface{})
	Debug(msg string, keysAndValues ...interface{})
}

// Observer receives the outcome of every execution. Used to publish metrics
// without making this package depend on a metrics library.
type Observer func(jobName string, status Status, duration time.Duration, items int)

// Scheduler runs registered jobs, one instance at a time across the fleet.
type Scheduler struct {
	registry *Registry
	store    *store
	locker   *locker
	log      Logger
	location *time.Location
	observe  Observer

	// running guards against a slow job being started twice by this instance
	// while its previous execution is still going.
	mu      sync.Mutex
	running map[string]bool

	// wg tracks in-flight executions so shutdown can wait for them.
	wg sync.WaitGroup
	// slots bounds concurrent executions; see maxConcurrent.
	slots chan struct{}
}

// NewScheduler creates a scheduler. location interprets RunAt; pass the
// business timezone, not the server's.
func NewScheduler(db *sql.DB, registry *Registry, log Logger, location *time.Location) *Scheduler {
	if location == nil {
		location = time.UTC
	}
	return &Scheduler{
		registry: registry,
		store:    &store{db: db},
		locker:   &locker{db: db},
		log:      log,
		location: location,
		running:  make(map[string]bool),
		slots:    make(chan struct{}, maxConcurrent),
	}
}

// SetObserver registers a callback invoked after each execution.
func (s *Scheduler) SetObserver(o Observer) { s.observe = o }

// Run blocks until ctx is cancelled, then waits for in-flight jobs to finish.
//
// Waiting matters: cancelling and exiting would leave rows stuck in "running"
// and could interrupt a half-written snapshot.
func (s *Scheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()

	s.log.Info("Job scheduler started",
		"jobs", len(s.registry.All()), "tick", tickInterval.String())

	for {
		select {
		case <-ticker.C:
			s.tick(ctx)
		case <-ctx.Done():
			s.log.Info("Job scheduler stopping; waiting for in-flight jobs")
			s.wg.Wait()
			s.log.Info("Job scheduler stopped")
			return
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	now := time.Now().In(s.location)

	for _, job := range s.registry.All() {
		if s.isRunningLocally(job.Name) {
			continue
		}

		lastRun, err := s.store.lastSuccessfulStart(ctx, job.Name)
		if err != nil {
			s.log.Error("Failed to read job history", "job", job.Name, "error", err)
			continue
		}
		if !isDue(job, lastRun.In(s.location), now) {
			continue
		}

		s.start(ctx, job)
	}
}

// isDue decides whether a job should run now.
//
// For RunAt jobs the question is "has the scheduled moment for the current
// period passed, and did the job not already run within this period?" — not
// "has 24 hours elapsed", which would drift with every deploy and place daily
// snapshots at an arbitrary hour.
func isDue(job Job, lastRun, now time.Time) bool {
	if job.Interval > 0 {
		if lastRun.IsZero() {
			return true
		}
		return now.Sub(lastRun) >= job.Interval
	}

	scheduled := periodStart(job, now).
		Add(time.Duration(job.RunAt.Hour)*time.Hour + time.Duration(job.RunAt.Minute)*time.Minute)
	if now.Before(scheduled) {
		return false
	}
	return lastRun.Before(scheduled)
}

// periodStart returns midnight of the current day, or of the job's weekday in
// the current week.
func periodStart(job Job, now time.Time) time.Time {
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	if job.Period != PeriodWeekly {
		return midnight
	}
	offset := (int(now.Weekday()) - int(job.Weekday) + 7) % 7
	return midnight.AddDate(0, 0, -offset)
}

func (s *Scheduler) isRunningLocally(name string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running[name]
}

func (s *Scheduler) setRunningLocally(name string, running bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if running {
		s.running[name] = true
	} else {
		delete(s.running, name)
	}
}

func (s *Scheduler) start(ctx context.Context, job Job) {
	s.setRunningLocally(job.Name, true)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer s.setRunningLocally(job.Name, false)

		// Wait for a slot rather than starting immediately. A job that waits a
		// few seconds is a background job behaving; a job that starts at once
		// and takes the last connection is an outage.
		select {
		case s.slots <- struct{}{}:
			defer func() { <-s.slots }()
		case <-ctx.Done():
			return
		}

		s.execute(ctx, job)
	}()
}

// Execute runs a job immediately, honouring the same lock. Used by the manual
// trigger so an operator cannot cause a concurrent second execution.
func (s *Scheduler) Execute(ctx context.Context, job Job) {
	s.setRunningLocally(job.Name, true)
	defer s.setRunningLocally(job.Name, false)
	s.execute(ctx, job)
}

func (s *Scheduler) execute(parent context.Context, job Job) {
	// Bookkeeping must survive the job's own deadline, so it uses a context
	// detached from the timeout below.
	bookkeeping := context.WithoutCancel(parent)

	handle, err := s.locker.tryLock(bookkeeping, job.Name)
	if err != nil {
		s.log.Error("Failed to acquire job lock", "job", job.Name, "error", err)
		return
	}
	if handle == nil {
		// Another instance is running it. Expected, not a problem.
		s.log.Debug("Job skipped: lock held elsewhere", "job", job.Name)
		if err := s.store.recordSkipped(bookkeeping, job.Name); err != nil {
			s.log.Error("Failed to record skipped run", "job", job.Name, "error", err)
		}
		return
	}
	defer handle.release(bookkeeping)

	runID, err := s.store.begin(bookkeeping, job.Name)
	if err != nil {
		s.log.Error("Failed to record job start", "job", job.Name, "error", err)
		return
	}

	runCtx, cancel := context.WithTimeout(parent, job.Timeout)
	defer cancel()

	started := time.Now()
	items, runErr := job.Run(runCtx)
	duration := time.Since(started)

	status := StatusSuccess
	if runErr != nil {
		status = StatusFailed
		s.log.Error("Job failed", "job", job.Name, "error", runErr, "duration", duration.String())
	} else {
		s.log.Info("Job finished", "job", job.Name, "items", items, "duration", duration.String())
	}

	if err := s.store.finish(bookkeeping, runID, status, items, runErr); err != nil {
		s.log.Error("Failed to record job finish", "job", job.Name, "error", err)
	}
	if s.observe != nil {
		s.observe(job.Name, status, duration, items)
	}
}

// History returns recent executions of a job.
func (s *Scheduler) History(ctx context.Context, jobName string, limit int) ([]Run, error) {
	return s.store.history(ctx, jobName, limit)
}

// LastRun returns the most recent execution, or nil when there is none.
func (s *Scheduler) LastRun(ctx context.Context, jobName string) (*Run, error) {
	runs, err := s.store.history(ctx, jobName, 1)
	if err != nil || len(runs) == 0 {
		return nil, err
	}
	return &runs[0], nil
}

// IsRunning reports whether an execution is in flight anywhere in the fleet.
func (s *Scheduler) IsRunning(ctx context.Context, jobName string) (bool, error) {
	return s.store.isRunning(ctx, jobName)
}

// PurgeHistory deletes runs older than the retention window.
func (s *Scheduler) PurgeHistory(ctx context.Context, retention time.Duration) (int, error) {
	return s.store.deleteOlderThan(ctx, time.Now().Add(-retention))
}

// Registry exposes the registered jobs.
func (s *Scheduler) Registry() *Registry { return s.registry }
