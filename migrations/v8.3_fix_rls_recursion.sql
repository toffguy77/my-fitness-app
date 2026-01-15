-- Migration: v8.3_fix_rls_recursion
-- Description: Исправление бесконечной рекурсии в RLS политиках для profiles
-- Dependencies: setup_database.sql
-- Date: 2025-01-20

-- Проблема: Функции is_super_admin и is_coordinator вызывают рекурсию при использовании в RLS политиках,
-- так как они читают из profiles, которая защищена RLS, и это создает бесконечный цикл.

-- Решение: Изменяем функции так, чтобы они использовали прямой доступ к данным
-- через pg_catalog или изменяем политики, чтобы избежать рекурсии.

-- Обновляем функцию is_super_admin для обхода RLS
-- Используем SET LOCAL для временного отключения RLS проверок внутри функции
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER функции выполняются с правами создателя функции
  -- и должны обходить RLS автоматически, но иногда требуется явное указание
  -- Используем прямой запрос - SECURITY DEFINER должен обойти RLS
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id
    AND role = 'super_admin'
  );
END;
$$;

-- Обновляем функцию is_coordinator для обхода RLS
CREATE OR REPLACE FUNCTION is_coordinator(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id
    AND role = 'coordinator'
  );
END;
$$;

-- Обновляем функцию is_client_coordinator для обхода RLS
CREATE OR REPLACE FUNCTION is_client_coordinator(client_id UUID, potential_coordinator_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = client_id
    AND profiles.coordinator_id = potential_coordinator_id
  );
END;
$$;

-- Изменяем политику UPDATE, чтобы она не использовала функции для обычных пользователей
-- Это предотвращает рекурсию, так как auth.uid() не требует чтения из profiles
-- Проблема: политика использовала is_super_admin(auth.uid()), что вызывало рекурсию,
-- так как функция читает из profiles, которая защищена RLS, и это создает бесконечный цикл
DROP POLICY IF EXISTS "Users can update profiles" ON profiles;
CREATE POLICY "Users can update profiles"
ON profiles FOR UPDATE
USING (
    auth.uid() = id
)
WITH CHECK (
    auth.uid() = id
);

-- Добавляем отдельную политику для super_admin, если нужно
-- Но для обычных обновлений достаточно проверки auth.uid() = id
-- Super admin может обновлять через отдельный механизм или иметь отдельную политику

COMMENT ON POLICY "Users can update profiles" ON profiles IS 'Пользователи могут обновлять только свой профиль. Это предотвращает рекурсию RLS при использовании функций is_super_admin.';

-- Исправляем SELECT политики, которые также вызывают рекурсию
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view profiles"
ON profiles FOR SELECT
USING (
    auth.uid() = id
    OR coordinator_id = auth.uid()
);

COMMENT ON POLICY "Users can view profiles" ON profiles IS 'Пользователи могут видеть свой профиль и профили своих клиентов (для координаторов). Это предотвращает рекурсию RLS.';

-- Обновляем политику для публичных профилей, убирая подзапрос, который может вызвать рекурсию
DROP POLICY IF EXISTS "Anyone can read public profiles" ON profiles;
CREATE POLICY "Anyone can read public profiles"
ON profiles FOR SELECT
USING (
  profile_visibility = 'public' OR
  auth.uid() = id OR
  coordinator_id = auth.uid()
);

COMMENT ON POLICY "Anyone can read public profiles" ON profiles IS 'Разрешает чтение публичных профилей всем, а также профилей своих клиентов для координаторов. Упрощенная версия без подзапросов для предотвращения рекурсии.';

COMMENT ON FUNCTION is_super_admin(UUID) IS 'Проверяет, является ли пользователь super_admin (без рекурсии RLS)';
COMMENT ON FUNCTION is_coordinator(UUID) IS 'Проверяет, является ли пользователь coordinator (без рекурсии RLS)';
COMMENT ON FUNCTION is_client_coordinator(UUID, UUID) IS 'Проверяет, является ли пользователь координатором клиента (без рекурсии RLS)';
