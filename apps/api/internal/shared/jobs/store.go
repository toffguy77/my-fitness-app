package jobs

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Status of a single job execution.
type Status string

const (
	StatusRunning Status = "running"
	StatusSuccess Status = "success"
	StatusFailed  Status = "failed"
	// StatusSkipped means another instance held the lock. Recorded rather than
	// ignored so "did anything run?" has an answer on every instance.
	StatusSkipped Status = "skipped"
	// StatusInterrupted means the process died while the job was running.
	//
	// Таймаут задачи обработан отдельно: `finish` пишет исход своим контекстом.
	// А вот внезапную смерть процесса — замену контейнера на выкатке, SIGKILL —
	// записать некому, и строка остаётся «running» навсегда. На проде таких
	// накопилось шесть за две недели: запись утверждала, что задача идёт, когда
	// ничего не шло.
	StatusInterrupted Status = "interrupted"
)

// Run is one recorded execution.
type Run struct {
	ID             string
	JobName        string
	StartedAt      time.Time
	FinishedAt     *time.Time
	Status         Status
	Error          string
	ItemsProcessed int
}

// store persists job history.
type store struct {
	db *sql.DB
}

// begin records the start of an execution and returns its id.
func (s *store) begin(ctx context.Context, jobName string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO job_runs (job_name, started_at, status)
		 VALUES ($1, NOW(), $2) RETURNING id::text`,
		jobName, StatusRunning).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("record job start: %w", err)
	}
	return id, nil
}

// finish completes an execution record. It takes its own context so the outcome
// is still written when the job's context has been cancelled by its timeout —
// otherwise a timed-out job would leave a row stuck in "running" forever.
func (s *store) finish(ctx context.Context, id string, status Status, items int, runErr error) error {
	var message string
	if runErr != nil {
		message = runErr.Error()
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE job_runs
		 SET finished_at = NOW(), status = $2, items_processed = $3, error = NULLIF($4, '')
		 WHERE id = $1::uuid`,
		id, status, items, message)
	if err != nil {
		return fmt.Errorf("record job finish: %w", err)
	}
	return nil
}

// closeOrphans marks runs nobody will ever finish.
//
// Вызывается при старте планировщика: всё, что числится идущим дольше порога,
// осталось от процесса, которого больше нет. Порог, а не «всё подряд», потому
// что во время выкатки старый контейнер ещё доживает свои задачи, и обрывать
// их записью было бы такой же неправдой, только наоборот.
func (s *store) closeOrphans(ctx context.Context, olderThan time.Duration) (int64, error) {
	result, err := s.db.ExecContext(ctx,
		`UPDATE job_runs
		 SET status = $1, finished_at = NOW(),
		     error = 'процесс завершился, не дописав исход'
		 WHERE status = $2 AND started_at < NOW() - $3::interval`,
		StatusInterrupted, StatusRunning, fmt.Sprintf("%d seconds", int(olderThan.Seconds())))
	if err != nil {
		return 0, fmt.Errorf("close orphaned runs: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("close orphaned runs: %w", err)
	}
	return affected, nil
}

// recordSkipped writes a completed "skipped" row in one statement.
func (s *store) recordSkipped(ctx context.Context, jobName string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO job_runs (job_name, started_at, finished_at, status)
		 VALUES ($1, NOW(), NOW(), $2)`,
		jobName, StatusSkipped)
	return err
}

// lastSuccessfulStart returns when the job last began a run that was not
// skipped. Skipped runs are excluded on purpose: an instance that could not get
// the lock has not done the work, and counting it would let a job go undone
// while its schedule looked satisfied.
func (s *store) lastSuccessfulStart(ctx context.Context, jobName string) (time.Time, error) {
	var startedAt sql.NullTime
	err := s.db.QueryRowContext(ctx,
		`SELECT MAX(started_at) FROM job_runs
		 WHERE job_name = $1 AND status <> $2`,
		jobName, StatusSkipped).Scan(&startedAt)
	if err != nil {
		return time.Time{}, fmt.Errorf("read last run: %w", err)
	}
	if !startedAt.Valid {
		return time.Time{}, nil
	}
	return startedAt.Time, nil
}

// isRunning reports whether an execution is currently in flight.
func (s *store) isRunning(ctx context.Context, jobName string) (bool, error) {
	var running bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM job_runs WHERE job_name = $1 AND status = $2)`,
		jobName, StatusRunning).Scan(&running)
	return running, err
}

// history returns recent runs, newest first.
func (s *store) history(ctx context.Context, jobName string, limit int) ([]Run, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id::text, job_name, started_at, finished_at, status,
		        COALESCE(error, ''), items_processed
		 FROM job_runs WHERE job_name = $1
		 ORDER BY started_at DESC LIMIT $2`,
		jobName, limit)
	if err != nil {
		return nil, fmt.Errorf("query job history: %w", err)
	}
	defer rows.Close()

	runs := make([]Run, 0, limit)
	for rows.Next() {
		var r Run
		if err := rows.Scan(&r.ID, &r.JobName, &r.StartedAt, &r.FinishedAt,
			&r.Status, &r.Error, &r.ItemsProcessed); err != nil {
			return nil, fmt.Errorf("scan job run: %w", err)
		}
		runs = append(runs, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate job history: %w", err)
	}
	return runs, nil
}

// deleteOlderThan removes history beyond the retention window.
func (s *store) deleteOlderThan(ctx context.Context, cutoff time.Time) (int, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM job_runs WHERE started_at < $1`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("delete old job runs: %w", err)
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}
