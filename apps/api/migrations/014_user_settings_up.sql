-- Migration: Add User Settings
-- Description: Extends users table with avatar/onboarding fields and creates user_settings table
-- Version: 014
-- Date: 2026-02-23

-- ============================================================================
-- 1. Extend users table
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- ============================================================================
-- 2. Create user_settings table (1:1 with users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Preferences
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'en')),
  units TEXT NOT NULL DEFAULT 'metric' CHECK (units IN ('metric', 'imperial')),

  -- Social accounts
  telegram_username TEXT,
  instagram_username TEXT,

  -- Integrations
  apple_health_enabled BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. Create indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ============================================================================
-- 4. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE user_settings IS 'User preferences and social account links';

COMMENT ON COLUMN user_settings.user_id IS 'Reference to the user (1:1 relationship)';
COMMENT ON COLUMN user_settings.language IS 'UI language preference: ru or en';
COMMENT ON COLUMN user_settings.units IS 'Measurement units preference: metric or imperial';
COMMENT ON COLUMN user_settings.telegram_username IS 'Telegram username for social linking';
COMMENT ON COLUMN user_settings.instagram_username IS 'Instagram username for social linking';
COMMENT ON COLUMN user_settings.apple_health_enabled IS 'Whether Apple Health integration is enabled';

-- ============================================================================
-- 5. Grant permissions for application DB user
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_settings') THEN
        EXECUTE 'GRANT ALL ON TABLE user_settings TO PUBLIC';
        RAISE NOTICE 'Granted permissions on user_settings table';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'user_settings_id_seq') THEN
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE user_settings_id_seq TO PUBLIC';
        RAISE NOTICE 'Granted permissions on user_settings_id_seq';
    END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================
