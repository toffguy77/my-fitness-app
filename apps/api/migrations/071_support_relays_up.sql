-- Что было зеркалировано в тему и откуда.
--
-- Нужно ради одного: куда вернуть ответ куратора. Клиент пишет в двух каналах,
-- и ответ в теме сам по себе не говорит, в приложение он или в Telegram.
-- Реплай на конкретное сообщение говорит — если помнить, чем это сообщение было.
--
-- Отсюда же берётся канал последнего сообщения клиента: правило для ответа без
-- реплая.
CREATE TABLE IF NOT EXISTS support_relays (
  -- message_id сообщения, которое бот отправил в тему.
  group_message_id BIGINT PRIMARY KEY,
  client_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source           TEXT NOT NULL CHECK (source IN ('app', 'telegram')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_relays_client
  ON support_relays(client_id, created_at DESC);

COMMENT ON TABLE support_relays IS 'Зеркалированные в тему сообщения клиента и их канал: по ним решается, куда вернуть ответ';
