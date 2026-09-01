-- Rollback for 046_job_runs_up.sql

DROP INDEX IF EXISTS idx_job_runs_started;
DROP INDEX IF EXISTS idx_job_runs_name_started;
DROP TABLE IF EXISTS job_runs;
