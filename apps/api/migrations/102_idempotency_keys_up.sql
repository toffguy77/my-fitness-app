-- Ключи идемпотентности (ios-app-foundation, idempotent-mutations).
--
-- Приложение досылает изменения из очереди и не знает, дошло ли первое:
-- сеть рвётся после того, как сервер записал, но до ответа. Повтор приходит
-- с тем же заголовком Idempotency-Key, и сервер отвечает сохранённым
-- ответом вместо второй записи.
--
-- Строка заводится до выполнения запроса (status IS NULL — запрос в
-- работе): одновременный дубль упирается в первичный ключ, а не выполняется
-- второй раз. По завершении сюда пишется ответ. Ответ 5xx строку снимает:
-- повтор выполнится заново. Строки старше суток убирает задача
-- cleanup.idempotency-keys.
CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key          UUID NOT NULL,
    method       TEXT NOT NULL,
    path         TEXT NOT NULL,
    -- sha256 тела запроса, hex: тот же ключ с другим телом — отказ 422.
    body_hash    TEXT NOT NULL,
    -- HTTP-статус сохранённого ответа; NULL, пока запрос выполняется.
    status       INTEGER,
    content_type TEXT,
    -- Тело ответа байт в байт: повтор обязан совпасть с первым ответом.
    response     BYTEA,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at
  ON idempotency_keys(created_at);
