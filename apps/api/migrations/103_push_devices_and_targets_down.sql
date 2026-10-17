DROP TABLE IF EXISTS push_deliveries;

ALTER TABLE users DROP COLUMN IF EXISTS push_show_message_text;
ALTER TABLE notifications DROP COLUMN IF EXISTS target;

ALTER TABLE push_devices DROP COLUMN IF EXISTS badge_pushed_at;
ALTER TABLE push_devices DROP COLUMN IF EXISTS badge_dirty_at;
ALTER TABLE push_devices DROP COLUMN IF EXISTS disabled_at;
ALTER TABLE push_devices DROP COLUMN IF EXISTS last_seen_at;
ALTER TABLE push_devices DROP COLUMN IF EXISTS platform;

ALTER TABLE push_devices RENAME CONSTRAINT push_devices_environment_check TO apns_devices_environment_check;
ALTER TABLE push_devices RENAME CONSTRAINT push_devices_user_id_fkey TO apns_devices_user_id_fkey;
ALTER TABLE push_devices RENAME CONSTRAINT push_devices_token_key TO apns_devices_token_key;
ALTER TABLE push_devices RENAME CONSTRAINT push_devices_pkey TO apns_devices_pkey;
ALTER INDEX idx_push_devices_user_id RENAME TO idx_apns_devices_user_id;
ALTER SEQUENCE push_devices_id_seq RENAME TO apns_devices_id_seq;
ALTER TABLE push_devices RENAME TO apns_devices;
