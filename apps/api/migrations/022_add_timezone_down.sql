-- 022_add_timezone_down.sql
ALTER TABLE user_settings
DROP COLUMN IF EXISTS timezone;
