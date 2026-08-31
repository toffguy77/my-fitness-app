-- Rollback for 048_account_deletion_up.sql
--
-- The technical "deleted user" account is deliberately left in place: rows
-- anonymised while this migration was applied point at it, and removing it
-- would break those references.

DROP INDEX IF EXISTS idx_data_exports_status;
DROP INDEX IF EXISTS idx_data_exports_user;
DROP TABLE IF EXISTS data_exports;

DROP INDEX IF EXISTS idx_users_deletion_requested;

ALTER TABLE users DROP COLUMN IF EXISTS is_system;
ALTER TABLE users DROP COLUMN IF EXISTS anonymized_at;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE users DROP COLUMN IF EXISTS deletion_requested_at;
