DROP INDEX IF EXISTS idx_users_files_pending;
ALTER TABLE users DROP COLUMN IF EXISTS files_purged_at;
