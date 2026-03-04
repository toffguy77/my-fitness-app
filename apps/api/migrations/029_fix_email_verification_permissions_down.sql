-- Revoke permissions on email_verification_codes (reverse of 029_up)

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_verification_codes') THEN
        EXECUTE 'REVOKE ALL ON TABLE email_verification_codes FROM PUBLIC';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'email_verification_codes_id_seq') THEN
        EXECUTE 'REVOKE USAGE, SELECT, UPDATE ON SEQUENCE email_verification_codes_id_seq FROM PUBLIC';
    END IF;
END $$;
