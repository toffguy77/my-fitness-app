-- Expand notifications type check constraint to include curator-originated notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'trainer_feedback', 'achievement', 'reminder', 'system_update',
        'new_feature', 'general', 'new_content',
        'plan_updated', 'task_assigned', 'task_overdue', 'feedback_received'
    ));
