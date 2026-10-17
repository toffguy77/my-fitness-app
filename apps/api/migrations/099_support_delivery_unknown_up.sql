-- Отметку доставки в Telegram (delivered_at) пишут с миграции 065. У ответов,
-- записанных раньше, она пуста не потому, что Telegram отказал, а потому, что её
-- тогда не вели. Без отдельного признака такие ответы выглядят недоставленными:
-- очередь обращений показывает «Не доставлено в Telegram», а «Повторить»
-- отправляет человеку ответ, который он, скорее всего, уже получил.
--
-- Граница — момент применения 065 в этой базе. На свежей базе строк до него нет,
-- и UPDATE ничего не находит. Повторный прогон тоже.
ALTER TABLE support_messages
    ADD COLUMN IF NOT EXISTS delivery_unknown BOOLEAN NOT NULL DEFAULT false;

UPDATE support_messages
SET delivery_unknown = true
WHERE delivered_at IS NULL
  AND author <> 'user'
  AND created_at < (SELECT applied_at FROM schema_migrations WHERE version = 65);
