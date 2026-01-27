-- Migration: Create Users Table
-- Description: Creates users and user_consents tables for authentication
-- Version: 000
-- Date: 2026-01-27

-- ============================================================================
-- 1. Create users table
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('client', 'coordinator', 'super_admin')) DEFAULT 'client',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add comments
COMMENT ON TABLE users IS 'User accounts for the BURCEV platform';
COMMENT ON COLUMN users.email IS 'User email address (unique)';
COMMENT ON COLUMN users.password IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.role IS 'User role: client, coordinator, or super_admin';

-- ============================================================================
-- 2. Create user_consents table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_consents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'data_processing', 'marketing')),
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_type ON user_consents(consent_type);

-- Add comments
COMMENT ON TABLE user_consents IS 'Audit trail for user consent agreements';
COMMENT ON COLUMN user_consents.consent_type IS 'Type of consent: terms_of_service, privacy_policy, data_processing, marketing';
COMMENT ON COLUMN user_consents.granted IS 'Whether consent was granted (true) or revoked (false)';

-- ============================================================================
-- Migration complete
-- ============================================================================
