-- Migration: v2.5.2_add_subscription_fields
-- Description: Добавление полей подписки в таблицу profiles для Freemium SaaS функционала
-- Dependencies: v2.5.1_add_super_admin_role.sql
-- Date: 2024-12-01

-- Добавление полей подписки в таблицу profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'active', 'cancelled', 'past_due')),
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'premium')),
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- Создание индексов для производительности
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_coach_id ON profiles(coach_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Комментарии к полям
COMMENT ON COLUMN profiles.subscription_status IS 'Статус подписки: free, active, cancelled, past_due';
COMMENT ON COLUMN profiles.subscription_tier IS 'Уровень подписки: basic, premium';
COMMENT ON COLUMN profiles.subscription_start_date IS 'Дата начала подписки';
COMMENT ON COLUMN profiles.subscription_end_date IS 'Дата окончания подписки';

