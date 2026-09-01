-- Rollback for 049_external_identities_up.sql
--
-- Restoring NOT NULL on users.password would fail for anyone who signed up
-- through a provider, so those rows get an unusable placeholder first — they
-- cannot sign in with it, and can set a real password through recovery.

UPDATE users SET password = 'NOLOGIN' WHERE password IS NULL;
ALTER TABLE users ALTER COLUMN password SET NOT NULL;

DROP INDEX IF EXISTS idx_external_identities_user_provider;
DROP INDEX IF EXISTS idx_external_identities_provider_user;
DROP TABLE IF EXISTS external_identities;
