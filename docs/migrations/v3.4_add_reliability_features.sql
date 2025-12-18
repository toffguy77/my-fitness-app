-- Migration: v3.4_add_reliability_features
-- Description: Добавление функций надежности и безопасности (Subscription Lifecycle, Notification Preferences, Coach Guardrails)
-- Dependencies: v3.2_add_feedback_loop.sql
-- Date: 2024-12-17

-- 1. Создаем таблицу notification_settings для управления уведомлениями
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_daily_digest BOOLEAN DEFAULT true,
  email_realtime_alerts BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE notification_settings IS 'Настройки уведомлений пользователя';
COMMENT ON COLUMN notification_settings.email_daily_digest IS 'Ежедневная сводка по email (default: true)';
COMMENT ON COLUMN notification_settings.email_realtime_alerts IS 'Мгновенные уведомления по email (default: false)';

-- 2. Создаем таблицу pending_notifications для очереди уведомлений (для будущего Cron-воркера)
CREATE TABLE IF NOT EXISTS pending_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('coach_note', 'check_in_reminder', 'weekly_digest')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0
);

COMMENT ON TABLE pending_notifications IS 'Очередь уведомлений для отправки (дайджесты и отложенные)';
COMMENT ON COLUMN pending_notifications.notification_type IS 'Тип уведомления: coach_note, check_in_reminder, weekly_digest';
COMMENT ON COLUMN pending_notifications.content IS 'JSONB с данными уведомления';
COMMENT ON COLUMN pending_notifications.sent_at IS 'Время отправки (NULL если еще не отправлено)';
COMMENT ON COLUMN pending_notifications.retry_count IS 'Количество попыток отправки';

-- 3. Создаем индексы
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_notifications_user_id ON pending_notifications(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_pending_notifications_unsent ON pending_notifications(sent_at) WHERE sent_at IS NULL;

-- 4. Добавляем CHECK constraints для nutrition_targets (защита от экстремальных значений)
ALTER TABLE nutrition_targets
ADD CONSTRAINT check_calories_range CHECK (calories >= 1000 AND calories <= 6000),
ADD CONSTRAINT check_protein_range CHECK (protein >= 20 AND protein <= 500),
ADD CONSTRAINT check_fats_range CHECK (fats >= 20 AND fats <= 200),
ADD CONSTRAINT check_carbs_range CHECK (carbs >= 20 AND carbs <= 500);

COMMENT ON CONSTRAINT check_calories_range ON nutrition_targets IS 'Калории: минимум 1000, максимум 6000 ккал';
COMMENT ON CONSTRAINT check_protein_range ON nutrition_targets IS 'Белки: минимум 20, максимум 500 г';
COMMENT ON CONSTRAINT check_fats_range ON nutrition_targets IS 'Жиры: минимум 20, максимум 200 г';
COMMENT ON CONSTRAINT check_carbs_range ON nutrition_targets IS 'Углеводы: минимум 20, максимум 500 г';

-- 5. RLS политики для notification_settings
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification settings"
  ON notification_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notification settings"
  ON notification_settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their own notification settings"
  ON notification_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 6. RLS политики для pending_notifications (только для чтения пользователем, запись через сервер)
ALTER TABLE pending_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pending notifications"
  ON pending_notifications FOR SELECT
  USING (user_id = auth.uid());

-- 7. Функция для автоматического обновления статуса подписки при истечении
CREATE OR REPLACE FUNCTION check_and_update_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Если subscription_end_date прошел, но статус еще не expired, обновляем
  IF NEW.subscription_end_date IS NOT NULL 
     AND NEW.subscription_end_date < NOW() 
     AND NEW.subscription_status != 'expired' THEN
    NEW.subscription_status := 'expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления статуса
CREATE TRIGGER update_subscription_status_on_expiry
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (OLD.subscription_end_date IS DISTINCT FROM NEW.subscription_end_date 
        OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status)
  EXECUTE FUNCTION check_and_update_subscription_status();

COMMENT ON FUNCTION check_and_update_subscription_status() IS 'Автоматически обновляет subscription_status на expired при истечении subscription_end_date';

