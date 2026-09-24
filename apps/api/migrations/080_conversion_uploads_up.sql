-- Migration: Conversions waiting to reach the advertising account
-- Version: 080
--
-- Four facts are worth reporting to Yandex: a registration, an address
-- confirmed, a first food entry, a curator assigned. None of them happens in a
-- browser, so none can be a goal; they go up through the offline conversions
-- API instead.
--
-- A queue rather than a request from the handler that records the fact: one
-- HTTP call to Yandex inside the registration handler makes their downtime our
-- downtime. The fact must be written even when there is nobody to tell.
--
-- `sent_at` is the whole point of the table. Without it a restarted job would
-- upload the same conversion again and the counter would show two
-- registrations for one person — an error indistinguishable afterwards from
-- real growth.

CREATE TABLE IF NOT EXISTS conversion_uploads (
  id BIGSERIAL PRIMARY KEY,

  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The event name, from the analytics dictionary. Not free-form: the upload
  -- names a goal, and a typo here is a goal that never fills.
  event_name TEXT NOT NULL,
  -- The browser the conversion is attributed to, copied at queue time from
  -- user_attribution. Copied rather than joined: attribution may be erased on
  -- request, and a conversion already queued should still be sendable.
  metrika_client_id TEXT NOT NULL,
  -- When the fact happened, not when it was uploaded. Yandex attributes by this.
  occurred_at TIMESTAMPTZ NOT NULL,

  sent_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One conversion of a kind per person, enforced by the database rather than
  -- by remembering to check: a second "registered" for the same account is
  -- always a defect.
  UNIQUE (user_id, event_name)
);

-- What the job asks for: the unsent ones, oldest first.
CREATE INDEX IF NOT EXISTS idx_conversion_uploads_pending
  ON conversion_uploads (occurred_at)
  WHERE sent_at IS NULL;
