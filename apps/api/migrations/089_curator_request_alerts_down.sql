-- ============================================================================
-- Откат миграции 089
-- ============================================================================
--
-- Уведомления о заявках на куратора удаляются: ограничение без их типа иначе
-- не встанет на таблицу, где они уже есть.

DELETE FROM notifications WHERE type = 'curator_requested';

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
        'support_escalated',
        'curator_access_ending',
        'curator_access_ended'
    ));

DROP INDEX IF EXISTS idx_leads_open_curator_requests;

ALTER TABLE leads
    DROP COLUMN IF EXISTS curator_request_raised_at,
    DROP COLUMN IF EXISTS curator_requested_at;
