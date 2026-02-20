-- Fix permissions on reset_tokens and password_reset_attempts sequences
-- The application DB user needs INSERT permission on these tables

DO $$
BEGIN
    -- Grant usage on sequences to public (covers all application users)
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'reset_tokens_id_seq') THEN
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE reset_tokens_id_seq TO PUBLIC';
        RAISE NOTICE 'Granted permissions on reset_tokens_id_seq';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'password_reset_attempts_id_seq') THEN
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE password_reset_attempts_id_seq TO PUBLIC';
        RAISE NOTICE 'Granted permissions on password_reset_attempts_id_seq';
    END IF;

    -- Also grant full table permissions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reset_tokens') THEN
        EXECUTE 'GRANT ALL ON TABLE reset_tokens TO PUBLIC';
        RAISE NOTICE 'Granted permissions on reset_tokens table';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'password_reset_attempts') THEN
        EXECUTE 'GRANT ALL ON TABLE password_reset_attempts TO PUBLIC';
        RAISE NOTICE 'Granted permissions on password_reset_attempts table';
    END IF;
END $$;
