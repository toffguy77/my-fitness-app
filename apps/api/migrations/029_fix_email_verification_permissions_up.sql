-- Fix permissions on email_verification_codes table and sequence
-- The application DB user needs SELECT/INSERT/UPDATE/DELETE on this table

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_verification_codes') THEN
        EXECUTE 'GRANT ALL ON TABLE email_verification_codes TO PUBLIC';
        RAISE NOTICE 'Granted permissions on email_verification_codes table';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'email_verification_codes_id_seq') THEN
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE email_verification_codes_id_seq TO PUBLIC';
        RAISE NOTICE 'Granted permissions on email_verification_codes_id_seq';
    END IF;
END $$;
