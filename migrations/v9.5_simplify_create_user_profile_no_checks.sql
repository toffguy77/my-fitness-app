-- Migration: v9.5_simplify_create_user_profile_no_checks
-- Description: Максимальное упрощение функции create_user_profile - только простой insert, никаких проверок
-- Проблема: функция вызывает statement timeout из-за проверок существования пользователя
-- Решение: убрать все проверки, оставить только простой insert с обработкой исключений
-- Dependencies: v9.4_remove_user_check_from_create_profile.sql
-- Date: 2025-01-XX

-- ============================================
-- МАКСИМАЛЬНОЕ УПРОЩЕНИЕ create_user_profile
-- ============================================

-- Функция максимально упрощена:
-- 1. Нет проверок существования пользователя (вызывается сразу после signUp)
-- 2. Нет задержек и retry логики (это вызывает timeout)
-- 3. Простой insert с обработкой исключений
-- 4. SECURITY DEFINER обходит RLS

CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT DEFAULT NULL,
  user_role user_role DEFAULT 'client',
  user_coordinator_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Просто создаем профиль, без всяких проверок
  -- Если профиль уже существует, игнорируем (ON CONFLICT не работает в функциях, используем IF NOT EXISTS логику)
  INSERT INTO profiles (
    id,
    email,
    full_name,
    role,
    coordinator_id,
    subscription_status,
    subscription_tier,
    profile_visibility,
    created_at,
    updated_at
  ) VALUES (
    user_id,
    user_email,
    user_full_name,
    user_role,
    user_coordinator_id,
    'free',
    'basic',
    'private',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN unique_violation THEN
    -- Профиль уже существует, это нормально - просто игнорируем
    NULL;
  WHEN foreign_key_violation THEN
    -- Если пользователь не существует в auth.users, выбрасываем ошибку
    RAISE EXCEPTION 'User with id % does not exist in auth.users', user_id;
END;
$$;

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Максимально упрощенная функция для создания профиля пользователя. Обходит RLS через SECURITY DEFINER. Не содержит проверок и задержек, чтобы избежать timeout. Используется при регистрации сразу после signUp.';

-- ============================================
-- ГОТОВО!
-- ============================================

-- Функция теперь максимально простая:
-- - Нет проверок существования пользователя
-- - Нет задержек и pg_sleep
-- - Простой insert с ON CONFLICT DO NOTHING
-- - Обработка исключений для graceful error handling
-- - Должна выполняться мгновенно, без timeout

