-- Migration: Pending external sign-in attempts
-- Version: 050
--
-- Two outcomes of an external sign-in cannot finish in the callback: an address
-- that already belongs to an account (the person must prove they own it), and a
-- provider that returned no address at all (we have to ask).
--
-- The profile has to survive until the user answers, and it cannot survive in
-- the browser: a client that could hand us a provider identity could claim
-- anyone's. The row is the server's copy; the browser only carries its id in an
-- HttpOnly cookie.

CREATE TABLE IF NOT EXISTS oauth_pending_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  -- The address the provider reported, empty when it reported none.
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Long enough to type a password, short enough that an abandoned attempt
  -- cannot be resumed by whoever uses the machine next.
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_links_expires_at
  ON oauth_pending_links(expires_at);

COMMENT ON TABLE oauth_pending_links IS 'External sign-in attempts awaiting proof of ownership or an address';
