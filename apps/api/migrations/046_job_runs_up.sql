-- Migration: Background job run history
-- Version: 046
--
-- Periodic work previously ran as one goroutine with a ticker, started from
-- main(). Nothing recorded whether it ran, so "are snapshots being collected?"
-- had no answer. This table is that answer.

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  -- success | failed | skipped (another instance held the lock)
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  error TEXT,
  items_processed INTEGER NOT NULL DEFAULT 0
);

-- The scheduler asks "when did this job last run?" on every tick.
CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON job_runs(job_name, started_at DESC);
-- Cleanup deletes by age.
CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs(started_at);

COMMENT ON TABLE job_runs IS 'History of periodic background job executions';
COMMENT ON COLUMN job_runs.status IS 'running while in flight; skipped when another instance held the advisory lock';
