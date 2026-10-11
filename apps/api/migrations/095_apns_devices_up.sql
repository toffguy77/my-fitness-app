-- iPhone, согласившийся на уведомления: токен устройства от APNs.
--
-- Отдельная таблица, а не строки push_subscriptions: у Web Push ключ — адрес
-- push-сервиса и пара ключей шифрования, у APNs — только токен и окружение
-- (production для TestFlight и App Store, sandbox для сборки из Xcode).
CREATE TABLE IF NOT EXISTS apns_devices (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        TEXT NOT NULL UNIQUE,
    environment  TEXT NOT NULL CHECK (environment IN ('production', 'sandbox')),
    app_version  TEXT,
    failures     INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_apns_devices_user_id ON apns_devices(user_id);
