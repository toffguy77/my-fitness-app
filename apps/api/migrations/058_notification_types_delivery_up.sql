-- export_ready и client_left появились вместе с удалением аккаунта и выгрузкой
-- данных, но в ограничение не попали: вставка такого уведомления падала бы, а
-- человек не узнавал бы, что его архив готов.
--
-- Список обязан совпадать с NotificationType.IsValid в
-- internal/modules/notifications/types.go — за этим следит
-- TestNotificationTypesMatchTheDatabaseConstraint.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'trainer_feedback', 'achievement', 'reminder', 'system_update',
        'new_feature', 'general', 'new_content',
        'plan_updated', 'task_assigned', 'task_overdue', 'feedback_received',
        'export_ready', 'client_left'
    ));
