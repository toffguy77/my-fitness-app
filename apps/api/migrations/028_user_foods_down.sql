-- Rollback for 028_user_foods_up.sql
--
-- This file was missing: migration 028 could be applied but not backed out.
-- Discovered by TestEveryMigrationHasARollback.
--
-- Note that 036_fix_user_foods_schema reshapes this table; rolling back 028
-- therefore requires rolling back 036 first, which the reverse-order rollback
-- test does.

DROP INDEX IF EXISTS idx_user_foods_name_fts;
DROP INDEX IF EXISTS idx_user_foods_user_id;
DROP TABLE IF EXISTS user_foods;
