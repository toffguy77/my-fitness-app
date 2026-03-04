ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('trainer_feedback', 'achievement', 'reminder', 'system_update', 'new_feature', 'general'));

ALTER TABLE notifications DROP COLUMN IF EXISTS content_category;
ALTER TABLE notifications DROP COLUMN IF EXISTS action_url;

DROP TABLE IF EXISTS content_notification_mute;
DROP TABLE IF EXISTS content_notification_preferences;
