-- Migration: v8.1_add_public_profiles
-- Description: Добавление поддержки публичных профилей
-- Dependencies: setup_database.sql
-- Date: 2025-01-20

-- Добавляем поле для настройки приватности профиля
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS profile_visibility TEXT DEFAULT 'private' 
  CHECK (profile_visibility IN ('private', 'public'));

COMMENT ON COLUMN profiles.profile_visibility IS 'Видимость профиля: private (приватный) или public (публичный)';

-- Создаем индекс для быстрого поиска публичных профилей
CREATE INDEX IF NOT EXISTS idx_profiles_public 
ON profiles(profile_visibility) 
WHERE profile_visibility = 'public';

-- Обновляем RLS политики для публичных профилей
-- Пользователи могут читать публичные профили
DROP POLICY IF EXISTS "Anyone can read public profiles" ON profiles;
CREATE POLICY "Anyone can read public profiles"
ON profiles FOR SELECT
USING (
  profile_visibility = 'public' OR
  auth.uid() = id OR
  (profiles.coach_id = auth.uid() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid()
    AND p.role = 'coach'
  ))
);

COMMENT ON POLICY "Anyone can read public profiles" ON profiles IS 'Разрешает чтение публичных профилей всем, а также профилей своих клиентов для тренеров';

