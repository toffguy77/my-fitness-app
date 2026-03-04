-- Content notification preferences (opt-out model: record = unsubscribed)
CREATE TABLE content_notification_preferences (
    user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
    category   content_category NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, category)
);

-- Content notification mute (global "do not disturb")
CREATE TABLE content_notification_mute (
    user_id  BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    muted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add action_url and content_category to notifications
ALTER TABLE notifications ADD COLUMN action_url VARCHAR(500);
ALTER TABLE notifications ADD COLUMN content_category VARCHAR(20);

-- Expand the type CHECK constraint to include 'new_content'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('trainer_feedback', 'achievement', 'reminder', 'system_update', 'new_feature', 'general', 'new_content'));
