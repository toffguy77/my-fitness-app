-- Возврат прежнего набора исходов. Уже записанные interrupted переводятся в
-- failed: терять сам факт, что запуск оборвался, незачем.
UPDATE job_runs SET status = 'failed' WHERE status = 'interrupted';
ALTER TABLE job_runs DROP CONSTRAINT IF EXISTS job_runs_status_check;
ALTER TABLE job_runs ADD CONSTRAINT job_runs_status_check
    CHECK (status IN ('running', 'success', 'failed', 'skipped'));
