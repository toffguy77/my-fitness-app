-- ============================================================================
-- Откат миграции 085
-- ============================================================================
--
-- Уже разосланные уведомления новых типов ограничению перестанут
-- соответствовать; ограничение проверяется только при вставке, поэтому строки
-- останутся на месте, но новых не будет.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'trainer_feedback',
        'achievement',
        'reminder',
        'system_update',
        'new_feature',
        'general',
        'new_content',
        'plan_updated',
        'task_assigned',
        'task_overdue',
        'feedback_received',
        'export_ready',
        'client_left',
        'support_escalated'
    ));
