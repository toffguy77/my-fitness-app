-- Migration: Where a user came from
-- Version: 079
--
-- Migration 073 put the campaign on the lead. That is not enough: claiming a
-- lead into a profile deletes the lead row (leads.Claim), deliberately — the
-- person is a user now, and keeping their contact and body parameters a second
-- time has no basis.
--
-- But every conversion worth reporting to the advertising account happens
-- after registration: the registration itself, the address being confirmed,
-- the first food entry, a curator being assigned. By then the lead is gone,
-- and without this table there would be no identifier to attribute any of them
-- to.
--
-- One row per user, written once when the lead is claimed. Not columns on
-- `users`: which advertisement somebody followed is a circumstance of their
-- arrival rather than a property of the person, and here it can be given a
-- retention of its own without touching the account.

CREATE TABLE IF NOT EXISTS user_attribution (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- The browser, as the counter knows it. Absent for anybody who refused the
  -- analytics cookie or runs an ad blocker — most rows will have none, and a
  -- conversion without it is not uploaded at all.
  metrika_client_id TEXT,
  -- Set by the ad network on a paid click. What ties a conversion to money.
  yandex_click_id TEXT,

  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The upload job asks for users whose browser is known; most are not.
CREATE INDEX IF NOT EXISTS idx_user_attribution_client_id
  ON user_attribution (metrika_client_id)
  WHERE metrika_client_id IS NOT NULL;
