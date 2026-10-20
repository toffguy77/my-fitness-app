-- Нативный вход, часть вторая (ios-native-session).
--
-- 1. oauth_app_handoffs (096) — передача входа приложению 0.3.x через
--    /auth/oauth/app-exchange. Её заменили oauth_handoff_codes (100) и
--    POST /auth/native/oauth/exchange; живых пользователей у 0.3.x нет,
--    совместимость не держим. Коды жили две минуты — терять нечего.
DROP TABLE IF EXISTS oauth_app_handoffs;

-- 2. Незавершённый вход через Apple (ждёт согласий или подтверждения
--    владения адресом) уже обменял authorization_code на refresh-токен
--    Apple: код одноразовый и живёт пять минут, дольше ждать нельзя. Токен
--    паркуется вместе с попыткой и переезжает в external_identities, когда
--    аккаунт появится. Зашифрован, как и там.
ALTER TABLE oauth_pending_links
  ADD COLUMN IF NOT EXISTS provider_refresh_token_enc TEXT;

-- Неудачные пароли при подтверждении владения адресом (/auth/oauth/link и
-- native/oauth/link). Пятая неудача сжигает попытку: pending-токен не
-- становится бесконечной лазейкой к перебору пароля в обход лимитов входа.
ALTER TABLE oauth_pending_links
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;

-- 3. Очередь отзыва токенов Apple. Удаление аккаунта кладёт сюда токен в
--    той же транзакции, что стирает привязку, затем пробует отозвать сразу;
--    неудача остаётся строкой, и её повторяет фоновая задача
--    auth.apple-revoke-retry. Без user_id намеренно: аккаунта уже нет, а
--    строка нужна только для того, чтобы Apple забыла доступ.
CREATE TABLE IF NOT EXISTS apple_token_revocations (
    id              BIGSERIAL PRIMARY KEY,
    token_enc       TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apple_token_revocations_next_attempt_at
  ON apple_token_revocations(next_attempt_at);
