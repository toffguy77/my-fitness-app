-- ============================================================================
-- Миграция 089: заявка на куратора зовёт людей
-- ============================================================================
--
-- Заявка на куратора лежала в очереди и ждала, пока кто-нибудь туда заглянет.
-- Единственная настоящая заявка за две недели пролежала так неделю, а
-- единственное, что получил человек, — письмо «ваш расчёт КБЖУ сохранён»,
-- напоминание для гостя, бросившего анкету.
--
-- curator_requested_at — когда строка стала заявкой на куратора. Не created_at:
-- гостевая строка становится заявкой позже, чем была заведена, и отсчёт
-- «сколько ждёт» от момента анкеты поднял бы её сразу же.
--
-- curator_request_raised_at — когда о необработанной заявке напомнили ещё раз.
-- Напоминают один раз: очередь, которая кричит на каждом проходе, перестаёт
-- что-либо значить.

ALTER TABLE leads
    ADD COLUMN curator_requested_at      TIMESTAMPTZ,
    ADD COLUMN curator_request_raised_at TIMESTAMPTZ;

-- Уже лежащие заявки получают отметку по последнему изменению: после выкатки
-- необработанные будут подняты повторным напоминанием, ради чего всё и делается.
UPDATE leads
   SET curator_requested_at = updated_at
 WHERE last_step IN ('curator_request', 'pricing');

-- Повторное напоминание ищет только необработанные заявки — их единицы.
CREATE INDEX idx_leads_open_curator_requests
    ON leads (curator_requested_at)
    WHERE curator_requested_at IS NOT NULL
      AND handled_at IS NULL
      AND curator_request_raised_at IS NULL;

-- Список обязан совпадать с NotificationType.IsValid в
-- internal/modules/notifications/types.go — за этим следит
-- TestNotificationTypesMatchTheDatabaseConstraint.
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
        'curator_access_ended',
        'curator_requested'
    ));
