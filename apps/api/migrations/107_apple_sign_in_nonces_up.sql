-- Одноразовый nonce входа через Apple, выданный сервером (apple-sign-in).
--
-- Раньше nonce придумывало приложение, и сервер проверял только, что
-- identity token несёт его хэш. Защиту от повтора давал одноразовый
-- authorization_code; когда вход привязанного аккаунта перестал зависеть
-- от обмена кода (Apple недоступна), перехваченный identity token с его
-- nonce можно было бы предъявить снова. Теперь nonce выдаёт
-- POST /auth/native/apple/nonce, здесь хранится его SHA-256 (то же, что
-- Apple кладёт в токен), и вход гасит строку ровно один раз.
--
-- Без user_id: строка живёт до входа, а очищает её cleanup.apple-nonces.
CREATE TABLE IF NOT EXISTS apple_sign_in_nonces (
    nonce_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apple_sign_in_nonces_expires_at
  ON apple_sign_in_nonces(expires_at);
