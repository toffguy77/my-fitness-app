-- Migration: v9.1_update_create_user_profile
-- Description: Обновление функции create_user_profile для использования user_coordinator_id вместо user_coach_id
-- Dependencies: v9.0_coach_to_coordinator.sql, v8.2_fix_profile_creation.sql
-- Date: 2025-01-XX

-- ВАЖНО: PostgreSQL не позволяет изменить имя параметра функции напрямую.
-- Нужно сначала удалить старую функцию, а затем создать новую.

-- Удаляем старую функцию с параметром user_coach_id
DROP FUNCTION IF EXISTS create_user_profile(uuid, text, text, user_role, uuid);

-- Создаем новую функцию с параметром user_coordinator_id
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

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Безопасно создает профиль пользователя, обходя RLS. Используется при регистрации. Параметр user_coordinator_id - ID координатора для назначения клиенту.';
