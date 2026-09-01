DROP INDEX IF EXISTS idx_user_consents_lead_id;
ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_subject_check;
ALTER TABLE user_consents DROP COLUMN IF EXISTS lead_id;
ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_consent_type_check;
ALTER TABLE user_consents ADD CONSTRAINT user_consents_consent_type_check
  CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'data_processing', 'marketing'));
-- Rows without a user cannot survive the column becoming mandatory again.
DELETE FROM user_consents WHERE user_id IS NULL;
ALTER TABLE user_consents ALTER COLUMN user_id SET NOT NULL;

DROP TABLE IF EXISTS leads;
