-- Migration: v9.4_remove_user_check_from_create_profile
-- Description: Удаление проверки существования пользователя из функции create_user_profile
-- Проблема: функция превышает statement timeout из-за множественных попыток с pg_sleep
-- Решение: убираем проверку, так как функция вызывается сразу после signUp, когда пользователь уже существует
-- Dependencies: v9.3_fix_foreign_key_constraint.sql
-- Date: 2025-01-XX

-- ============================================
-- УПРОЩЕНИЕ ФУНКЦИИ create_user_profile
-- ============================================

-- Убираем проверку существования пользователя, так как:
-- 1. Функция вызывается сразу после signUp, когда пользователь уже должен существовать
-- 2. Retry механизм есть на клиентской стороне
-- 3. Проверка на стороне БД занимает слишком много времени и вызывает timeout

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
  -- Проверяем, что профиль еще не существует
  IF EXISTS (SELECT 1 FROM profiles WHERE id = user_id) THEN
    RETURN;
  END IF;

  -- Создаем профиль
  -- Если пользователь не существует в auth.users, foreign key constraint вернет ошибку,
  -- которую можно обработать на клиентской стороне
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
  );
EXCEPTION
  WHEN foreign_key_violation THEN
    -- Если foreign key constraint нарушен (пользователь не существует),
    -- выбрасываем понятную ошибку
    RAISE EXCEPTION 'User with id % does not exist in auth.users. Please ensure the user is created before calling this function.', user_id;
END;
$$;

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Безопасно создает профиль пользователя, обходя RLS. Используется при регистрации. Параметр user_coordinator_id - ID координатора для назначения клиенту. Если пользователь не существует в auth.users, выбрасывается ошибка foreign_key_violation.';

-- ============================================
-- ГОТОВО!
-- ============================================

-- Функция упрощена: убрана проверка существования пользователя с множественными попытками.
-- Это устраняет проблему statement timeout. Если пользователь не существует,
-- foreign key constraint автоматически вернет ошибку, которую можно обработать на клиенте.

