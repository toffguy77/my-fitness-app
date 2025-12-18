-- Migration: v2.6.1_fix_rls_recursion
-- Description: Исправление бесконечной рекурсии в RLS политиках через security definer функции
-- Dependencies: v2.5.3_add_super_admin_rls.sql
-- Date: 2024-12-05
-- 
-- Проблема: политики для profiles обращаются к profiles, создавая цикл
-- Решение: используем security definer функции для проверки роли

-- ============================================
-- ШАГ 1: Создание функций для проверки роли (без рекурсии)
-- ============================================

-- Функция для проверки, является ли пользователь super_admin
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'super_admin'
  );
END;
$$;

-- Функция для проверки, является ли пользователь coach
CREATE OR REPLACE FUNCTION is_coach(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'coach'
  );
END;
$$;

-- Функция для проверки, является ли пользователь coach для конкретного клиента
CREATE OR REPLACE FUNCTION is_client_coach(client_id UUID, potential_coach_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = client_id
    AND profiles.coach_id = potential_coach_id
  );
END;
$$;

-- ============================================
-- ШАГ 2: Обновление политик для profiles (без рекурсии)
-- ============================================

-- Удаляем старые политики
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Coaches can view their clients" ON profiles;

-- Политика SELECT для profiles
CREATE POLICY "Users can view profiles"
ON profiles FOR SELECT
USING (
    -- Пользователь может видеть свой профиль
    auth.uid() = id
    -- Super admin может видеть все профили
    OR is_super_admin(auth.uid())
    -- Coach может видеть профили своих клиентов
    OR (
        is_coach(auth.uid())
        AND coach_id = auth.uid()
    )
);

-- Политика UPDATE для profiles
CREATE POLICY "Users can update profiles"
ON profiles FOR UPDATE
USING (
    -- Пользователь может обновлять свой профиль
    auth.uid() = id
    -- Super admin может обновлять все профили
    OR is_super_admin(auth.uid())
);

-- Политика INSERT для profiles
CREATE POLICY "Users can insert profiles"
ON profiles FOR INSERT
WITH CHECK (
    -- Пользователь может создавать свой профиль
    auth.uid() = id
    -- Super admin может создавать профили
    OR is_super_admin(auth.uid())
);

-- ============================================
-- ШАГ 3: Обновление политик для daily_logs
-- ============================================

-- Удаляем старые политики
DROP POLICY IF EXISTS "Super admins can view all daily logs" ON daily_logs;
DROP POLICY IF EXISTS "Super admins can update all daily logs" ON daily_logs;
DROP POLICY IF EXISTS "Super admins can delete daily logs" ON daily_logs;
DROP POLICY IF EXISTS "Users can view own daily logs" ON daily_logs;
DROP POLICY IF EXISTS "Coaches can view client daily logs" ON daily_logs;
DROP POLICY IF EXISTS "Users can insert own daily logs" ON daily_logs;
DROP POLICY IF EXISTS "Users can update own daily logs" ON daily_logs;

-- Политика SELECT для daily_logs
CREATE POLICY "Users can view daily logs"
ON daily_logs FOR SELECT
USING (
    -- Пользователь может видеть свои логи
    auth.uid() = user_id
    -- Super admin может видеть все логи
    OR is_super_admin(auth.uid())
    -- Coach может видеть логи своих клиентов
    OR (
        is_coach(auth.uid())
        AND is_client_coach(daily_logs.user_id, auth.uid())
    )
);

-- Политика INSERT для daily_logs
CREATE POLICY "Users can insert daily logs"
ON daily_logs FOR INSERT
WITH CHECK (
    -- Пользователь может создавать свои логи
    auth.uid() = user_id
    -- Super admin может создавать логи для всех
    OR is_super_admin(auth.uid())
);

-- Политика UPDATE для daily_logs
CREATE POLICY "Users can update daily logs"
ON daily_logs FOR UPDATE
USING (
    -- Пользователь может обновлять свои логи
    auth.uid() = user_id
    -- Super admin может обновлять все логи
    OR is_super_admin(auth.uid())
    -- Coach может обновлять логи своих клиентов
    OR (
        is_coach(auth.uid())
        AND is_client_coach(daily_logs.user_id, auth.uid())
    )
);

-- Политика DELETE для daily_logs
CREATE POLICY "Users can delete daily logs"
ON daily_logs FOR DELETE
USING (
    -- Пользователь может удалять свои логи
    auth.uid() = user_id
    -- Super admin может удалять все логи
    OR is_super_admin(auth.uid())
);

-- ============================================
-- ШАГ 4: Обновление политик для nutrition_targets
-- ============================================

-- Удаляем старые политики
DROP POLICY IF EXISTS "Super admins can view all nutrition targets" ON nutrition_targets;
DROP POLICY IF EXISTS "Super admins can update all nutrition targets" ON nutrition_targets;
DROP POLICY IF EXISTS "Super admins can insert nutrition targets" ON nutrition_targets;
DROP POLICY IF EXISTS "Super admins can delete nutrition targets" ON nutrition_targets;
DROP POLICY IF EXISTS "Users can view own nutrition targets" ON nutrition_targets;
DROP POLICY IF EXISTS "Coaches can view client nutrition targets" ON nutrition_targets;
DROP POLICY IF EXISTS "Users can insert own nutrition targets" ON nutrition_targets;
DROP POLICY IF EXISTS "Users can update own nutrition targets" ON nutrition_targets;

-- Политика SELECT для nutrition_targets
CREATE POLICY "Users can view nutrition targets"
ON nutrition_targets FOR SELECT
USING (
    -- Пользователь может видеть свои цели
    auth.uid() = user_id
    -- Super admin может видеть все цели
    OR is_super_admin(auth.uid())
    -- Coach может видеть цели своих клиентов
    OR (
        is_coach(auth.uid())
        AND is_client_coach(nutrition_targets.user_id, auth.uid())
    )
);

-- Политика INSERT для nutrition_targets
CREATE POLICY "Users can insert nutrition targets"
ON nutrition_targets FOR INSERT
WITH CHECK (
    -- Пользователь может создавать свои цели (но обычно это делает coach)
    auth.uid() = user_id
    -- Super admin может создавать цели для всех
    OR is_super_admin(auth.uid())
    -- Coach может создавать цели для своих клиентов
    OR (
        is_coach(auth.uid())
        AND is_client_coach(nutrition_targets.user_id, auth.uid())
    )
);

-- Политика UPDATE для nutrition_targets
CREATE POLICY "Users can update nutrition targets"
ON nutrition_targets FOR UPDATE
USING (
    -- Пользователь может обновлять свои цели
    auth.uid() = user_id
    -- Super admin может обновлять все цели
    OR is_super_admin(auth.uid())
    -- Coach может обновлять цели своих клиентов
    OR (
        is_coach(auth.uid())
        AND is_client_coach(nutrition_targets.user_id, auth.uid())
    )
);

-- Политика DELETE для nutrition_targets
CREATE POLICY "Users can delete nutrition targets"
ON nutrition_targets FOR DELETE
USING (
    -- Пользователь может удалять свои цели
    auth.uid() = user_id
    -- Super admin может удалять все цели
    OR is_super_admin(auth.uid())
    -- Coach может удалять цели своих клиентов
    OR (
        is_coach(auth.uid())
        AND is_client_coach(nutrition_targets.user_id, auth.uid())
    )
);

-- ============================================
-- Комментарии
-- ============================================
COMMENT ON FUNCTION is_super_admin(UUID) IS 'Проверяет, является ли пользователь super_admin (без рекурсии RLS)';
COMMENT ON FUNCTION is_coach(UUID) IS 'Проверяет, является ли пользователь coach (без рекурсии RLS)';
COMMENT ON FUNCTION is_client_coach(UUID, UUID) IS 'Проверяет, является ли пользователь тренером клиента (без рекурсии RLS)';

