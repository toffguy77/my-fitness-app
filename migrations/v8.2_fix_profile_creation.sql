-- Migration: v8.2_fix_profile_creation
-- Description: Исправление проблемы создания профиля при регистрации
-- Dependencies: setup_database.sql
-- Date: 2025-01-20

-- Создаем функцию для безопасного создания профиля
-- Эта функция обходит RLS, так как использует SECURITY DEFINER
CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT DEFAULT NULL,
  user_role user_role DEFAULT 'client',
  user_coach_id UUID DEFAULT NULL
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
    coach_id,
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
    user_coach_id,
    'free',
    'basic',
    'private',
    NOW(),
    NOW()
  );
END;
$$;

COMMENT ON FUNCTION create_user_profile(UUID, TEXT, TEXT, user_role, UUID) IS 'Безопасно создает профиль пользователя, обходя RLS. Используется при регистрации.';

-- Обновляем RLS политику для INSERT, чтобы разрешить создание профиля через функцию
-- Политика уже существует, но мы убедимся, что она корректна
DROP POLICY IF EXISTS "Users can insert profiles" ON profiles;
CREATE POLICY "Users can insert profiles"
ON profiles FOR INSERT
WITH CHECK (
    auth.uid() = id
    OR is_super_admin(auth.uid())
);

COMMENT ON POLICY "Users can insert profiles" ON profiles IS 'Пользователи могут создавать свой профиль сразу после регистрации';

