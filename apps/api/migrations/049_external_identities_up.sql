-- Migration: External identity providers
-- Version: 049
--
-- The only way to create an account was email plus password, followed by a
-- confirmation email: the longest possible path, losing people at every step.

CREATE TABLE IF NOT EXISTS external_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- yandex | vk | max
  provider TEXT NOT NULL,
  -- The provider's own identifier for the person. Identity is this pair, not
  -- the email address: an address can change on the provider's side, and is
  -- not unique across providers.
  provider_user_id TEXT NOT NULL,
  -- Kept for display only; never used to match accounts.
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- One external account belongs to exactly one user...
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_identities_provider_user
  ON external_identities(provider, provider_user_id);
-- ...and a user links each provider at most once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_identities_user_provider
  ON external_identities(user_id, provider);

-- A user who signed up through a provider has no password. The column becomes
-- nullable rather than storing a placeholder, so "has no password" is a fact
-- the schema states rather than a convention to remember.
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

COMMENT ON TABLE external_identities IS 'Links between accounts and external sign-in providers';
COMMENT ON COLUMN external_identities.provider_user_id IS 'Identity is (provider, provider_user_id); email is display only';
