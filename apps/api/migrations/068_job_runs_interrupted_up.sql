-- Исход для запуска, который никто не дописал.
--
-- Таймаут задачи обработан: исход пишется своим контекстом. А внезапную смерть
-- процесса — замену контейнера на выкатке, SIGKILL — записать некому, и строка
-- остаётся «running» навсегда. На проде таких накопилось шесть за две недели, и
-- каждая утверждала, что задача идёт, когда ничего не шло.
ALTER TABLE job_runs DROP CONSTRAINT IF EXISTS job_runs_status_check;
ALTER TABLE job_runs ADD CONSTRAINT job_runs_status_check
    CHECK (status IN ('running', 'success', 'failed', 'skipped', 'interrupted'));

COMMENT ON COLUMN job_runs.status IS
    'running пока идёт; skipped когда блокировку держал другой экземпляр; '
    'interrupted когда процесс умер, не дописав исход';
