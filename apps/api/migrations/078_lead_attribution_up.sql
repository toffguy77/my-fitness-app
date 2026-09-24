-- Migration: Where a lead came from
-- Version: 078
--
-- `leads.source` (migration 051) was meant to answer "which channels bring
-- people who finish". It never could: the browser wrote `document.referrer`
-- into it, which is empty for a direct visit and the ad network's own domain
-- for a paid click. In practice the column is blank on almost every row.
--
-- The question actually asked is "which campaign", and it needs fields, not a
-- string: an administrative list groups by campaign, and grouping by a URL
-- means parsing one on every read.
--
-- `yandex_click_id` is separate from the tags on purpose. The tags can be put
-- on a link by anybody, including us in our own letters; the click id is set by
-- the ad network, and it is what ties a conversion back to a paid click.
--
-- `metrika_client_id` identifies the browser to the counter. It arrives after
-- the lead is created — the counter hands it over through a callback that
-- never fires behind an ad blocker — so it is nullable and written later.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS yandex_click_id TEXT,
  ADD COLUMN IF NOT EXISTS metrika_client_id TEXT;

-- The administrative list groups by campaign; without this it reads the table.
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign
  ON leads (utm_campaign)
  WHERE utm_campaign IS NOT NULL;

-- The conversion upload asks "which leads have an identifier": most will not.
CREATE INDEX IF NOT EXISTS idx_leads_metrika_client_id
  ON leads (metrika_client_id)
  WHERE metrika_client_id IS NOT NULL;
