CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    replaced_by_hash VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Grant permissions (required for Yandex Cloud managed PostgreSQL)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
        EXECUTE 'GRANT ALL ON TABLE refresh_tokens TO PUBLIC';
        RAISE NOTICE 'Granted permissions on refresh_tokens table';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'refresh_tokens_id_seq') THEN
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE refresh_tokens_id_seq TO PUBLIC';
        RAISE NOTICE 'Granted permissions on refresh_tokens_id_seq';
    END IF;
END $$;
