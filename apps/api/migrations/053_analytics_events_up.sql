-- Migration: Product analytics events
-- Version: 053
--
-- The only analytics was a page-view counter: it knew about visits, and nothing
-- about how many people reached their first food entry, where the onboarding
-- loses them, or whether a change to the funnel helped.
--
-- The events live here rather than in an external service: health data and
-- product events would otherwise sit in the same table on somebody else's
-- servers, which is a question this avoids rather than answers.

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  -- From the fixed dictionary; the server refuses anything else.
  name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Generated in the browser and stable across visits. Not personal data, and
  -- not a secret: it exists so the funnel does not break at the one point that
  -- matters most — anonymous visitor becoming a registered user.
  visitor_id UUID NOT NULL,
  -- Present once the visitor has signed in.
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  platform TEXT,
  app_version TEXT,
  -- Categorical and numeric values only. No address, no name, no message text,
  -- no weight, no measurements, no calories, no dish names — checked on the way
  -- in rather than at review time.
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- The three questions every report asks: what happened, when, and to whom.
CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at ON analytics_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_time ON analytics_events(name, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor ON analytics_events(visitor_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id, occurred_at)
  WHERE user_id IS NOT NULL;

-- Ties a browser to the account it eventually created, so events from before
-- the registration belong to the same person as the ones after it.
CREATE TABLE IF NOT EXISTS analytics_identities (
  visitor_id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_identities_user ON analytics_identities(user_id);

COMMENT ON TABLE analytics_events IS 'Product events; no health data, no message content, no addresses';
COMMENT ON COLUMN analytics_events.visitor_id IS 'Browser-scoped identifier, linked to a user on sign-in';
