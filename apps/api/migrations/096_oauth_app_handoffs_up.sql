-- Одноразовые коды входа через Яндекс/VK для iOS-приложения: обратный вызов
-- выдаёт код, приложение меняет его вместе с секретом (challenge — его хэш)
-- на сессию. Живут две минуты, удаляются при обмене.
CREATE TABLE IF NOT EXISTS oauth_app_handoffs (
    code_hash  TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge  TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_app_handoffs_user_id ON oauth_app_handoffs(user_id);
