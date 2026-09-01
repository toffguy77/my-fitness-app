-- Migration: Account deletion and data export
-- Version: 048
--
-- The product collects weight, body measurements, progress photographs, a food
-- diary and conversations with a curator — health data. The settings screen
-- offered a "Delete account" button that showed a toast reading "feature in
-- development", and there was no export at all.

-- Two-stage deletion. deletion_requested_at starts a cancellation window;
-- deleted_at records that the irreversible pass has run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- Marks the technical account that anonymised references point at, so it can
-- never be logged into or listed as a real user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- The deletion job scans by this column.
CREATE INDEX IF NOT EXISTS idx_users_deletion_requested
  ON users(deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;

-- The "deleted user" placeholder. Messages keep their text but lose their
-- author, so a curator's conversation history stays readable.
--
-- The password hash is a literal that no bcrypt comparison can match, so the
-- account cannot be signed into.
INSERT INTO users (email, password, name, role, email_verified, onboarding_completed, is_system)
SELECT 'deleted-user@system.invalid', 'NOLOGIN', 'Удалённый пользователь', 'client', true, true, true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'deleted-user@system.invalid');

-- Data exports are built asynchronously: an archive with a year of photographs
-- cannot be assembled inside an HTTP request.
CREATE TABLE IF NOT EXISTS data_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- pending | building | ready | failed
  status TEXT NOT NULL DEFAULT 'pending',
  s3_key TEXT,
  error TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  -- A single download, within a day: the archive contains everything we hold
  -- about the person.
  downloaded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_exports(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_exports_status ON data_exports(status);

COMMENT ON COLUMN users.deletion_requested_at IS 'Start of the 30-day cancellation window';
COMMENT ON COLUMN users.is_system IS 'Technical account; never a real person, never listed or logged into';
COMMENT ON TABLE data_exports IS 'Asynchronously built archives of a user''s own data';
