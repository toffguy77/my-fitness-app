-- Phase 2.5: ШАГ 3 - Обновление RLS Policies для super_admin
-- Выполните ЭТОТ запрос ПОСЛЕ успешного выполнения ШАГОВ 1-2

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

-- Комментарии к полям
COMMENT ON COLUMN profiles.subscription_status IS 'Статус подписки: free, active, cancelled, past_due';
COMMENT ON COLUMN profiles.subscription_tier IS 'Уровень подписки: basic, premium';
COMMENT ON COLUMN profiles.subscription_start_date IS 'Дата начала подписки';
COMMENT ON COLUMN profiles.subscription_end_date IS 'Дата окончания подписки';

