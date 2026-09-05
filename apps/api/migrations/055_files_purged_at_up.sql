-- Migration: Record when a deleted account's files were actually removed
-- Version: 055
--
-- Erasure commits the database transaction and then deletes objects from four
-- buckets. A storage outage must not undo an erasure the user asked for, so
-- the file deletion is best-effort — but "best effort" without a record means
-- the leftovers are never retried and the person's photographs stay in a
-- bucket forever.

ALTER TABLE users ADD COLUMN IF NOT EXISTS files_purged_at TIMESTAMPTZ;

-- The retry job walks erased accounts whose files are still there.
CREATE INDEX IF NOT EXISTS idx_users_files_pending
  ON users(deleted_at)
  WHERE deleted_at IS NOT NULL AND files_purged_at IS NULL;

COMMENT ON COLUMN users.files_purged_at IS 'Set once every bucket confirmed deletion; NULL means a retry is owed';
