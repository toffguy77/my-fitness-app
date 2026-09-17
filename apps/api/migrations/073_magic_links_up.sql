-- Migration: Magic links
-- Version: 073
--
-- Вход по одноразовой ссылке — отдельный механизм, а не переиспользование
-- сброса пароля. Токен сброса даёт право сменить пароль, токен входа — право
-- на сессию: общий механизм означал бы, что ошибка в одном становится дырой в
-- другом, а сроки жизни у них обязаны различаться.

CREATE TABLE IF NOT EXISTS magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Хранится только хэш: ссылка из письма не должна восстанавливаться из базы.
  token_hash TEXT NOT NULL UNIQUE,

  -- Адрес, на который ссылка выдана. Аккаунта на него может ещё не быть —
  -- тогда переход по ссылке его создаст.
  email TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,

  -- Согласия, данные при запросе ссылки. Нужны только когда аккаунта нет:
  -- согласие должно быть дано до обработки, а обработка начинается с письма.
  consents JSONB,

  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,

  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Погашение ищет по хэшу и проверяет срок; уборка ходит по сроку.
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

-- Аккаунт, созданный по ссылке, живёт без пароля. Существующие аккаунты
-- не затрагиваются: у них хэш есть.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

COMMENT ON TABLE magic_links IS 'Одноразовые ссылки входа, живут 15 минут';
COMMENT ON COLUMN magic_links.consents IS 'Согласия, данные при запросе; применяются при создании аккаунта';
