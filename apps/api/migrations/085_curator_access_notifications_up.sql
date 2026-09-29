-- ============================================================================
-- Миграция 085: уведомления об окончании права на куратора
-- ============================================================================
--
-- Молча исчезнувший куратор читается как поломка сервиса, а не как окончание
-- оплаты: человек идёт в поддержку вместо того, чтобы продлить. Поэтому о
-- приближении и о наступлении окончания сообщают отдельными типами — тип
-- решает, куда уведомление доставлять и как его показывать.
--
-- Куратор получает то же уведомление о наступлении: не зная о прекращении, он
-- продолжит работу, за которую больше не платят.
--
-- Перечисление типов охраняется ограничением: незаявленный тип — отказ вставки,
-- то есть уведомление, которое не придёт никому и никогда.

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
