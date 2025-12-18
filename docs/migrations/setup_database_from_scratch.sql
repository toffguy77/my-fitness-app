-- Setup Database from Scratch
-- Description: Полный сетап базы данных My Fitness App с нуля
-- Date: 2025-01-XX
-- 
-- ВАЖНО: Этот скрипт создает базу данных с нуля.
-- Используйте только для новых проектов или полного пересоздания базы.
-- Для существующих баз используйте инкрементальные миграции.

-- ============================================
-- БАЗОВАЯ СХЕМА (Phase 1 - MVP)
-- ============================================

-- 1. Создание enum типов
DO $$ 
BEGIN
    -- Создаем enum для ролей пользователей
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('client', 'coach');
    END IF;
END $$;

-- 2. Таблица profiles (базовая структура)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role user_role DEFAULT 'client',
    coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Таблица nutrition_targets (цели питания)
CREATE TABLE IF NOT EXISTS nutrition_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    day_type TEXT NOT NULL CHECK (day_type IN ('training', 'rest')),
    calories INTEGER NOT NULL,
    protein INTEGER NOT NULL,
    fats INTEGER NOT NULL,
    carbs INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, day_type, is_active) WHERE is_active = true
);

-- 4. Таблица daily_logs (дневные логи питания)
CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    target_type TEXT CHECK (target_type IN ('training', 'rest')),
    actual_calories INTEGER DEFAULT 0,
    actual_protein INTEGER DEFAULT 0,
    actual_fats INTEGER DEFAULT 0,
    actual_carbs INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- 5. Базовые индексы
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_coach_id ON profiles(coach_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_targets_user_id ON nutrition_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_targets_active ON nutrition_targets(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, date DESC);

-- 6. RLS (Row Level Security) - базовая настройка
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

-- Базовые RLS политики (будут расширены в миграциях)
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own nutrition targets"
    ON nutrition_targets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own nutrition targets"
    ON nutrition_targets FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own daily logs"
    ON daily_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own daily logs"
    ON daily_logs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- ПРИМЕНЕНИЕ ВСЕХ МИГРАЦИЙ
-- ============================================
-- 
-- После создания базовой схемы выполните все миграции последовательно:
-- 
-- 1. v2.5.1_add_super_admin_role.sql
-- 2. v2.5.2_add_subscription_fields.sql
-- 3. v2.5.3_add_super_admin_rls.sql
-- 4. v2.6.1_fix_rls_recursion.sql
-- 5. v2.6.2_add_phone_to_profiles.sql
-- 6. v2.6.3_add_meals_to_daily_logs.sql
-- 7. v2.6.4_add_weight_tracking.sql
-- 8. v3.1_add_onboarding_fields.sql
-- 9. v3.2_add_feedback_loop.sql
-- 10. v3.3_add_validation_and_notifications.sql
-- 
-- Или используйте скрипт apply_all_migrations.sql (если создан)

-- ============================================
-- КОММЕНТАРИИ
-- ============================================
COMMENT ON TABLE profiles IS 'Профили пользователей приложения';
COMMENT ON TABLE nutrition_targets IS 'Цели питания для пользователей (тренировочные дни и дни отдыха)';
COMMENT ON TABLE daily_logs IS 'Дневные логи питания пользователей';

COMMENT ON COLUMN profiles.role IS 'Роль пользователя: client или coach';
COMMENT ON COLUMN profiles.coach_id IS 'ID тренера (для клиентов)';
COMMENT ON COLUMN nutrition_targets.day_type IS 'Тип дня: training (тренировка) или rest (отдых)';
COMMENT ON COLUMN daily_logs.target_type IS 'Тип дня, для которого был создан лог: training или rest';

