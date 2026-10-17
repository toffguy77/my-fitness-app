-- Пуши на iPhone наравне с браузером, адрес экрана у уведомления и задание на
-- каждый адресат пуша.

-- 1. Устройства. Таблица из 095 переименовывается, а не создаётся заново:
-- токены уже зарегистрированных телефонов остаются, вместе с installation_id —
-- без него токен нельзя было бы перенести на другой аккаунт того же телефона.
ALTER TABLE apns_devices RENAME TO push_devices;
ALTER SEQUENCE apns_devices_id_seq RENAME TO push_devices_id_seq;
ALTER INDEX idx_apns_devices_user_id RENAME TO idx_push_devices_user_id;
ALTER TABLE push_devices RENAME CONSTRAINT apns_devices_pkey TO push_devices_pkey;
ALTER TABLE push_devices RENAME CONSTRAINT apns_devices_token_key TO push_devices_token_key;
ALTER TABLE push_devices RENAME CONSTRAINT apns_devices_user_id_fkey TO push_devices_user_id_fkey;
ALTER TABLE push_devices RENAME CONSTRAINT apns_devices_environment_check TO push_devices_environment_check;

-- Платформа: сегодня только iOS, но адресат пуша описан без привязки к Apple.
ALTER TABLE push_devices ADD COLUMN platform TEXT NOT NULL DEFAULT 'ios'
    CONSTRAINT push_devices_platform_check CHECK (platform IN ('ios'));
-- Последняя регистрация: приложение повторяет её при каждом запуске.
ALTER TABLE push_devices ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- APNs ответил, что токен мёртв (410 Unregistered, 400 BadDeviceToken).
-- Устройство не удаляется, а отключается: так видно, что и когда случилось, а
-- новая регистрация того же токена его снова включает.
ALTER TABLE push_devices ADD COLUMN disabled_at TIMESTAMPTZ;
-- Тихое обновление значка. badge_dirty_at — число непрочитанного изменилось и
-- значок на телефоне устарел; badge_pushed_at — когда ушёл последний фоновый
-- пуш: не чаще раза в минуту на устройство.
ALTER TABLE push_devices ADD COLUMN badge_dirty_at TIMESTAMPTZ;
ALTER TABLE push_devices ADD COLUMN badge_pushed_at TIMESTAMPTZ;

-- 2. Адрес экрана. Записи, созданные до этой миграции, ведут в список
-- уведомлений: какой экран они открывали, по веб-пути надёжно не восстановить.
ALTER TABLE notifications ADD COLUMN target JSONB NOT NULL DEFAULT '{"kind":"notifications"}';

-- 3. «Показывать текст сообщений» в пуше о сообщении чата. По умолчанию — да,
-- как в мессенджерах.
ALTER TABLE users ADD COLUMN push_show_message_text BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Задание на каждый адресат пуша: подписку браузера или устройство.
--
-- Одного задания на канал мало: Web Push в тихое время откладывается, а iPhone
-- получает пуш сразу, но без звука; повтор после частичного сбоя не должен
-- слать пуш тем, кто его уже получил. Строка notification_deliveries канала
-- push остаётся сводной.
CREATE TABLE push_deliveries (
    id              BIGSERIAL   PRIMARY KEY,
    -- Уведомление или сообщение чата — ровно одно из двух. Сообщение чата
    -- уведомлением не является и строки в notifications не имеет.
    notification_id UUID        REFERENCES notifications(id) ON DELETE CASCADE,
    chat_message_id UUID        REFERENCES messages(id) ON DELETE CASCADE,
    user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transport       TEXT        NOT NULL CHECK (transport IN ('webpush', 'apns')),
    subscription_id BIGINT      REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    device_id       BIGINT      REFERENCES push_devices(id) ON DELETE CASCADE,
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
    attempts        INT         NOT NULL DEFAULT 0,
    not_before      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT push_deliveries_one_source
        CHECK ((notification_id IS NULL) <> (chat_message_id IS NULL)),
    CONSTRAINT push_deliveries_addressee_matches_transport
        CHECK ((transport = 'webpush' AND subscription_id IS NOT NULL AND device_id IS NULL)
            OR (transport = 'apns' AND device_id IS NOT NULL AND subscription_id IS NULL))
);

-- Единственный запрос отправителя: что пора отправить.
CREATE INDEX idx_push_deliveries_due ON push_deliveries (not_before) WHERE status = 'pending';
CREATE INDEX idx_push_deliveries_user ON push_deliveries (user_id);
CREATE INDEX idx_push_deliveries_notification ON push_deliveries (notification_id)
    WHERE notification_id IS NOT NULL;
CREATE INDEX idx_push_deliveries_chat_message ON push_deliveries (chat_message_id)
    WHERE chat_message_id IS NOT NULL;
CREATE INDEX idx_push_deliveries_subscription ON push_deliveries (subscription_id)
    WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_push_deliveries_device ON push_deliveries (device_id)
    WHERE device_id IS NOT NULL;

DO $$ BEGIN
    EXECUTE 'GRANT ALL ON TABLE push_devices TO PUBLIC';
    EXECUTE 'GRANT ALL ON SEQUENCE push_devices_id_seq TO PUBLIC';
    EXECUTE 'GRANT ALL ON TABLE push_deliveries TO PUBLIC';
    EXECUTE 'GRANT ALL ON SEQUENCE push_deliveries_id_seq TO PUBLIC';
END $$;
