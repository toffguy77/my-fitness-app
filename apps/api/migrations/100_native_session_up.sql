-- Сессия нативного приложения (ios-native-session).
--
-- refresh_tokens.client_kind различает веб и приложение: у них разный срок
-- (веб — 24 часа или 30 дней с «Запомнить меня», приложение — 90 дней со
-- скользящим окном) и разные эндпоинты. Токен одного вида не принимается
-- эндпоинтом другого. По умолчанию 'web': всё, что выпущено до этой
-- миграции, выпущено вебом или приложением 0.3.x через веб-эндпоинты.
--
-- device_name — модель телефона («iPhone 15»), без имени владельца и без
-- идентификаторов устройства: для будущего списка устройств в профиле.
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS client_kind TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS device_name TEXT;

ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_client_kind_check;
ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_client_kind_check CHECK (client_kind IN ('web', 'ios'));

-- Одноразовый код, которым колбэк OAuth Яндекса и VK передаёт результат входа
-- приложению через universal link /auth/native-complete?code=.
--
-- Код хранится хэшем, живёт 60 секунд и гасится первым обращением
-- (used_at), даже если verifier не совпал. app_challenge —
-- BASE64URL(SHA256(code_verifier)) приложения.
--
-- user_id — аккаунт, в который вход завершён; пусто, если вход не завершён
-- (result.status = needs_email / needs_link_confirmation / needs_consents, и
-- тогда в result лежит pending-токен). Отдельной колонкой, а не внутри
-- result: удаление аккаунта обязано найти и стереть код, ведущий в него.
CREATE TABLE IF NOT EXISTS oauth_handoff_codes (
    code_hash     TEXT PRIMARY KEY,
    app_challenge TEXT NOT NULL,
    user_id       BIGINT REFERENCES users(id) ON DELETE CASCADE,
    result        JSONB NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_handoff_codes_user_id
  ON oauth_handoff_codes(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_handoff_codes_expires_at
  ON oauth_handoff_codes(expires_at);

-- Refresh-токен Apple, полученный обменом authorization_code. Нужен, чтобы
-- отозвать доступ при удалении аккаунта (Guideline 5.1.1(v)). Хранится
-- зашифрованным; заполняется только у provider = 'apple'.
ALTER TABLE external_identities
  ADD COLUMN IF NOT EXISTS provider_refresh_token_enc TEXT;
