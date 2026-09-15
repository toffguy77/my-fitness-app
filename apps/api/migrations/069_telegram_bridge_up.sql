-- Привязка Telegram к учётной записи и мост переписки.
--
-- Три таблицы и одно поле, каждое под своё требование:
--
--   telegram_links         — числовой chat_id, без которого бот не может
--                            написать человеку. В профиле есть только
--                            telegram_username, а по имени Bot API частному
--                            лицу не пишет.
--   telegram_link_tickets  — одноразовый билет привязки. Билет даёт право
--                            получать чужие уведомления, поэтому в базе его
--                            хэш, а не он сам.
--   support_topics         — тема форума на клиента. Привязана к клиенту, а не
--                            к каналу: у клиента один разговор, даже когда он
--                            пишет и в приложение, и в бот.
--   support_conversations.answered_at
--                          — по нему решается, подключился ли человек.
--                            Просмотр очереди не считается: клиенту он ничего
--                            не сообщает.

CREATE TABLE IF NOT EXISTS telegram_links (
  user_id   BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Один Telegram не может быть двумя кураторами сразу.
  chat_id   BIGINT NOT NULL UNIQUE,
  -- Справочно, для показа в профиле. Решения по нему не принимаются никогда:
  -- имя меняется, идентификатор — нет.
  username  TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE telegram_links IS 'Числовой chat_id Telegram, привязанный к учётной записи';
COMMENT ON COLUMN telegram_links.username IS 'Справочно для профиля; отправка идёт только по chat_id';

CREATE TABLE IF NOT EXISTS telegram_link_tickets (
  -- Хэш, а не сам билет: утечка таблицы не должна давать возможность привязаться.
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tickets_user ON telegram_link_tickets(user_id);

COMMENT ON TABLE telegram_link_tickets IS 'Одноразовые билеты привязки Telegram; хранится хэш';

CREATE TABLE IF NOT EXISTS support_topics (
  client_id  BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- message_thread_id темы форума в группе кураторов.
  thread_id  BIGINT NOT NULL,
  closed_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_topics_thread ON support_topics(thread_id);

COMMENT ON TABLE support_topics IS 'Тема форума Telegram на клиента: обе его переписки в одном месте';

ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;

COMMENT ON COLUMN support_conversations.answered_at IS 'Когда человек действительно ответил; просмотр очереди не считается';
