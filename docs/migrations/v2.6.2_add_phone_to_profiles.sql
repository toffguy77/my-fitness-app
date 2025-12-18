-- Migration: v2.6.2_add_phone_to_profiles
-- Description: Добавление поля phone (телефон) в таблицу profiles
-- Dependencies: v2.6.1_fix_rls_recursion.sql
-- Date: 2024-12-10

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN profiles.phone IS 'Телефон пользователя';

-- Создаем индекс для быстрого поиска по телефону (опционально)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;

