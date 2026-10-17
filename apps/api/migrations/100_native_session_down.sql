ALTER TABLE external_identities DROP COLUMN IF EXISTS provider_refresh_token_enc;

DROP TABLE IF EXISTS oauth_handoff_codes;

ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_client_kind_check;
ALTER TABLE refresh_tokens
  DROP COLUMN IF EXISTS device_name,
  DROP COLUMN IF EXISTS client_kind;
