ALTER TABLE user_attribution DROP COLUMN IF EXISTS landing_page;
ALTER TABLE user_attribution DROP COLUMN IF EXISTS referrer;
ALTER TABLE leads DROP COLUMN IF EXISTS landing_page;
ALTER TABLE leads DROP COLUMN IF EXISTS referrer;
