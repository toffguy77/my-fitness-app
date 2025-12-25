-- Migration: v9.3_fix_foreign_key_constraint
-- Description: Исправление ошибки foreign key constraint при создании профиля
-- Проблема: функция create_user_profile пытается создать профиль до того,
-- как пользователь полностью создан в auth.users
-- Dependencies: v9.1_update_create_user_profile.sql
-- Date: 2025-01-XX

-- ============================================
-- ИСПРАВЛЕНИЕ ФУНКЦИИ create_user_profile
-- ============================================

-- Обновляем функцию create_user_profile, чтобы она проверяла
-- существование пользователя в auth.users перед созданием профиля
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
DECLARE
  user_exists BOOLEAN;
  max_retries INTEGER := 5;
  retry_count INTEGER := 0;
  retry_delay INTERVAL := '100 milliseconds';
BEGIN
  -- Проверяем, что профиль еще не существует
  IF EXISTS (SELECT 1 FROM profiles WHERE id = user_id) THEN
    RETURN;
  END IF;

  -- Проверяем существование пользователя в auth.users
  -- Делаем несколько попыток с задержкой, так как пользователь может создаваться асинхронно
  LOOP
    -- Проверяем существование пользователя в auth.users
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE id = user_id
    ) INTO user_exists;

    -- Если пользователь найден, выходим из цикла
    EXIT WHEN user_exists;

    -- Если достигнуто максимальное количество попыток, выбрасываем ошибку
    IF retry_count >= max_retries THEN
      RAISE EXCEPTION 'User with id % does not exist in auth.users after % attempts', user_id, max_retries;
    END IF;

    -- Увеличиваем счетчик попыток и ждем перед следующей попыткой
    retry_count := retry_count + 1;
    PERFORM pg_sleep(EXTRACT(EPOCH FROM retry_delay));
  END LOOP;

  -- Теперь создаем профиль, так как пользователь точно существует
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
END;
$$;

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Безопасно создает профиль пользователя, обходя RLS. Проверяет существование пользователя в auth.users перед созданием профиля. Используется при регистрации. Параметр user_coordinator_id - ID координатора для назначения клиенту.';

-- ============================================
-- ГОТОВО!
-- ============================================

-- Функция теперь проверяет существование пользователя в auth.users
-- перед созданием профиля, что предотвращает ошибку foreign key constraint.

