-- Revert to previous notification types (remove curator-originated types)
-- Note: this will fail if rows with new types exist
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'trainer_feedback', 'achievement', 'reminder', 'system_update',
        'new_feature', 'general', 'new_content'
    ));
