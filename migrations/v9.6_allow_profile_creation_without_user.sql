-- Migration: v9.6_allow_profile_creation_without_user
-- Description: Изменяем функцию create_user_profile, чтобы она не выбрасывала ошибку при foreign_key_violation
-- Проблема: пользователь не существует в auth.users сразу после signUp, что вызывает ошибку
-- Решение: игнорируем foreign_key_violation и позволяем триггеру handle_new_user создать профиль позже
-- Dependencies: v9.5_simplify_create_user_profile_no_checks.sql
-- Date: 2025-01-XX

-- ============================================
-- ИЗМЕНЕНИЕ: ИГНОРИРОВАНИЕ FOREIGN KEY VIOLATION
-- ============================================

-- Функция теперь игнорирует foreign_key_violation:
-- - Если пользователь существует в auth.users - создаем профиль сразу
-- - Если пользователь не существует - игнорируем ошибку, триггер handle_new_user создаст профиль позже

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
  -- Если профиль уже существует, игнорируем (ON CONFLICT)
  -- Если пользователь не существует в auth.users - тоже игнорируем (триггер создаст позже)
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
    -- Пользователь еще не существует в auth.users - это нормально
    -- Триггер handle_new_user создаст профиль автоматически, когда пользователь появится
    -- Просто игнорируем эту ошибку, не выбрасываем исключение
    NULL;
END;
$$;

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Создает профиль пользователя. Обходит RLS через SECURITY DEFINER. Если пользователь не существует в auth.users, ошибка игнорируется - триггер handle_new_user создаст профиль автоматически, когда пользователь появится.';

-- ============================================
-- ГОТОВО!
-- ============================================

-- Функция теперь:
-- - Не выбрасывает ошибку при foreign_key_violation
-- - Позволяет триггеру handle_new_user создать профиль позже
-- - Идемпотентна (ON CONFLICT DO NOTHING)
-- - Всегда возвращает успех (или игнорирует ошибки)


