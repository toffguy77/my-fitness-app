DROP TABLE IF EXISTS apple_token_revocations;

ALTER TABLE oauth_pending_links DROP COLUMN IF EXISTS failed_attempts;
ALTER TABLE oauth_pending_links DROP COLUMN IF EXISTS provider_refresh_token_enc;

CREATE TABLE IF NOT EXISTS oauth_app_handoffs (
    code_hash  TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge  TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_app_handoffs_user_id ON oauth_app_handoffs(user_id);
