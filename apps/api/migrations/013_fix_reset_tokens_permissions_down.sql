-- Revoke permissions granted in up migration
DO $
BEGIN
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'reset_tokens_id_seq') THEN
        EXECUTE 'REVOKE USAGE, SELECT, UPDATE ON SEQUENCE reset_tokens_id_seq FROM PUBLIC';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'password_reset_attempts_id_seq') THEN
        EXECUTE 'REVOKE USAGE, SELECT, UPDATE ON SEQUENCE password_reset_attempts_id_seq FROM PUBLIC';
    END IF;
END $;
