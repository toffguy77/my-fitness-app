-- Migration: Support channels
-- Version: 076
--
-- Разговор поддержки был устроен вокруг Telegram, хотя привязан к нему слабо:
-- ответ строит Answerer по базе знаний, эскалация и очередь работают с
-- разговором, потолок вызовов считается глобально. Телеграмного в нём ровно
-- два места — идентификатор чата и отправка ответа.

ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'telegram'
    CHECK (channel IN ('telegram', 'web'));

-- Хранится только хэш: токен из браузера не должен восстанавливаться из базы.
ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS web_token_hash TEXT UNIQUE;

-- У веб-разговора нет идентификатора чата Telegram.
ALTER TABLE support_conversations ALTER COLUMN chat_id DROP NOT NULL;

-- Ровно один идентификатор на разговор. Без этого снятие NOT NULL открывает
-- возможность строки, которую никто не сможет найти. Приём тот же, что у
-- user_consents_subject_check в миграции 051.
ALTER TABLE support_conversations DROP CONSTRAINT IF EXISTS support_conversations_identity_check;
ALTER TABLE support_conversations ADD CONSTRAINT support_conversations_identity_check
  CHECK ((chat_id IS NOT NULL) <> (web_token_hash IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_support_conversations_channel
  ON support_conversations(channel, status);

COMMENT ON COLUMN support_conversations.channel IS 'telegram | web';
COMMENT ON COLUMN support_conversations.web_token_hash IS 'Хэш предъявительского токена веб-разговора';
