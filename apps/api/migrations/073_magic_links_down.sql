-- Откат. Аккаунты без пароля после отката смогут войти только через
-- восстановление пароля, поэтому откат после их появления требует рассылки
-- приглашения задать пароль — см. design.md, Migration Plan.
DROP INDEX IF EXISTS idx_magic_links_email;
DROP INDEX IF EXISTS idx_magic_links_expires;
DROP TABLE IF EXISTS magic_links;

UPDATE users SET password_hash = '' WHERE password_hash IS NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
