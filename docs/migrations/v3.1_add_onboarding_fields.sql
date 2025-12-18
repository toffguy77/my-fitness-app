-- Migration: v3.1_add_onboarding_fields
-- Description: Добавление полей для Onboarding (биометрические данные) и улучшений UX
-- Dependencies: v2.6.4_add_weight_tracking.sql
-- Date: 2024-12-17

-- 1. Добавляем поля в таблицу profiles для биометрических данных
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other')),
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS height INTEGER, -- рост в см
ADD COLUMN IF NOT EXISTS activity_level TEXT CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active'));

COMMENT ON COLUMN profiles.gender IS 'Пол пользователя (male, female, other)';
COMMENT ON COLUMN profiles.birth_date IS 'Дата рождения для расчета возраста';
COMMENT ON COLUMN profiles.height IS 'Рост в сантиметрах';
COMMENT ON COLUMN profiles.activity_level IS 'Уровень активности: sedentary (1.2), light (1.375), moderate (1.55), active (1.725), very_active (1.9)';

-- 2. Добавляем поле is_completed в daily_logs для фиксации Check-in
ALTER TABLE daily_logs
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;

COMMENT ON COLUMN daily_logs.is_completed IS 'Флаг завершения дня (Check-in). True означает, что день завершен и отправлен тренеру.';

-- 3. Создаем индекс для быстрого поиска по дате рождения (для расчета возраста)
CREATE INDEX IF NOT EXISTS idx_profiles_birth_date ON profiles(birth_date);

-- 4. Создаем индекс для поиска завершенных дней
CREATE INDEX IF NOT EXISTS idx_daily_logs_is_completed ON daily_logs(user_id, is_completed, date);

