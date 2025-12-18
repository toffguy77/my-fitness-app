-- Migration: v2.5.3_add_super_admin_rls
-- Description: Добавление RLS политик для роли super_admin (Phase 2.5)
-- Dependencies: v2.5.2_add_subscription_fields.sql
-- Date: 2024-12-01
-- 
-- ВАЖНО: Эта миграция создает политики с рекурсией, которые будут исправлены в v2.6.1

-- 1. Profiles: Super admin видит всех
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

-- 2. Daily logs: Super admin видит все логи
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

-- 3. Nutrition targets: Super admin видит все цели
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

