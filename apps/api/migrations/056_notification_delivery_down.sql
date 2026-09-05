ALTER TABLE users DROP COLUMN IF EXISTS email_unsubscribed_at;
ALTER TABLE users DROP COLUMN IF EXISTS quiet_hours_end;
ALTER TABLE users DROP COLUMN IF EXISTS quiet_hours_start;

DROP INDEX IF EXISTS idx_notification_deliveries_user;
DROP INDEX IF EXISTS idx_notification_deliveries_due;
DROP TABLE IF EXISTS notification_deliveries;
DROP TABLE IF EXISTS notification_preferences;
