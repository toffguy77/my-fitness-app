-- Migration: Where a visit began, not only which campaign
-- Version: 091
--
-- Campaign tags (073, 079) answer "which advertisement". Search and Dzen put
-- no tags on their links: a visitor from there arrives with an empty query
-- string and was attributed to nobody. The external page they followed a link
-- from, and the page they landed on, are kept beside the tags — on the lead,
-- and on the account it becomes.
--
-- Both are the first touch of the browser within thirty days (see
-- apps/web/src/shared/analytics/attribution.ts). The referrer is origin and
-- path only: a query string can carry a search phrase or an address.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_page TEXT;

ALTER TABLE user_attribution ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE user_attribution ADD COLUMN IF NOT EXISTS landing_page TEXT;
