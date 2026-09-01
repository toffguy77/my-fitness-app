-- IF NOT EXISTS added so the chain can be applied to an empty database:
-- several of these objects are also created by earlier migrations, and a
-- bare CREATE aborted the run. Idempotent statements are a no-op where the
-- object already exists, so production is unaffected.
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user_id ON email_verification_codes(user_id);
