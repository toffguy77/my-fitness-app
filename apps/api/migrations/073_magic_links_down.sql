-- Откат. Не трогаем users.password: столбец остаётся nullable, как был до миграции.
-- Пустую строку при откате не устанавливаем — это создала бы состояние, при котором
-- беспарольный аккаунт проходил бы проверку на пустой пароль в auth/service.go.
DROP INDEX IF EXISTS idx_magic_links_email;
DROP INDEX IF EXISTS idx_magic_links_expires;
DROP TABLE IF EXISTS magic_links;
