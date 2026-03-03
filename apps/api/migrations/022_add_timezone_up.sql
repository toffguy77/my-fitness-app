-- 022_add_timezone_up.sql
ALTER TABLE user_settings
ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';
