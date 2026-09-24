DROP INDEX IF EXISTS idx_leads_metrika_client_id;
DROP INDEX IF EXISTS idx_leads_utm_campaign;

ALTER TABLE leads
  DROP COLUMN IF EXISTS metrika_client_id,
  DROP COLUMN IF EXISTS yandex_click_id,
  DROP COLUMN IF EXISTS utm_term,
  DROP COLUMN IF EXISTS utm_content,
  DROP COLUMN IF EXISTS utm_campaign,
  DROP COLUMN IF EXISTS utm_medium,
  DROP COLUMN IF EXISTS utm_source;
