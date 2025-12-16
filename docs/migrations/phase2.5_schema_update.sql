-- Phase 2.5: Business Logic & Access Control
-- Миграция для добавления Freemium SaaS функционала
-- 
-- ВАЖНО: Выполняйте запросы ПООЧЕРЕДНО, не все сразу!
-- PostgreSQL требует коммита после добавления нового значения enum

-- ============================================
-- ШАГ 1: Добавление super_admin в enum
-- ============================================
-- Выполните ЭТОТ запрос ПЕРВЫМ и дождитесь успешного выполнения
DO $$ 
BEGIN
    -- Проверяем, существует ли значение 'super_admin' в enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'super_admin' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        ALTER TYPE user_role ADD VALUE 'super_admin';
    END IF;
END $$;

-- ============================================
-- ШАГ 2: Добавление полей подписки
-- ============================================
-- Выполните ЭТОТ запрос ПОСЛЕ успешного выполнения ШАГА 1

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'active', 'cancelled', 'past_due')),
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'premium')),
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- ============================================
-- ШАГ 3: Создание индексов
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_coach_id ON profiles(coach_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================
-- ШАГ 4: Обновление RLS Policies для super_admin
-- ============================================
-- Выполните ЭТОТ запрос ПОСЛЕ успешного выполнения ШАГОВ 1-3

-- 4.1. Profiles: Super admin видит всех
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
CREATE POLICY "Super admins can view all profiles"
ON profiles FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'coach'
        AND p.id = profiles.coach_id
    )
);

DROP POLICY IF EXISTS "Super admins can update all profiles" ON profiles;
CREATE POLICY "Super admins can update all profiles"
ON profiles FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR auth.uid() = id
);

DROP POLICY IF EXISTS "Super admins can insert profiles" ON profiles;
CREATE POLICY "Super admins can insert profiles"
ON profiles FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR auth.uid() = id
);

-- 4.2. Daily logs: Super admin видит все логи
DROP POLICY IF EXISTS "Super admins can view all daily logs" ON daily_logs;
CREATE POLICY "Super admins can view all daily logs"
ON daily_logs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = daily_logs.user_id
        AND p.coach_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Super admins can update all daily logs" ON daily_logs;
CREATE POLICY "Super admins can update all daily logs"
ON daily_logs FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR auth.uid() = user_id
);

DROP POLICY IF EXISTS "Super admins can delete daily logs" ON daily_logs;
CREATE POLICY "Super admins can delete daily logs"
ON daily_logs FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

-- 4.3. Nutrition targets: Super admin видит все цели
DROP POLICY IF EXISTS "Super admins can view all nutrition targets" ON nutrition_targets;
CREATE POLICY "Super admins can view all nutrition targets"
ON nutrition_targets FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = nutrition_targets.user_id
        AND p.coach_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Super admins can update all nutrition targets" ON nutrition_targets;
CREATE POLICY "Super admins can update all nutrition targets"
ON nutrition_targets FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = nutrition_targets.user_id
        AND p.coach_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Super admins can insert nutrition targets" ON nutrition_targets;
CREATE POLICY "Super admins can insert nutrition targets"
ON nutrition_targets FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR auth.uid() = user_id
);

DROP POLICY IF EXISTS "Super admins can delete nutrition targets" ON nutrition_targets;
CREATE POLICY "Super admins can delete nutrition targets"
ON nutrition_targets FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

-- 5. Комментарии к полям
COMMENT ON COLUMN profiles.subscription_status IS 'Статус подписки: free, active, cancelled, past_due';
COMMENT ON COLUMN profiles.subscription_tier IS 'Уровень подписки: basic, premium';
COMMENT ON COLUMN profiles.subscription_start_date IS 'Дата начала подписки';
COMMENT ON COLUMN profiles.subscription_end_date IS 'Дата окончания подписки';

