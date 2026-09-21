-- Откат удаляет веб-разговоры явно: без этого возврат NOT NULL на chat_id
-- уронил бы миграцию на первой же строке из браузера.
DROP INDEX IF EXISTS idx_support_conversations_channel;
ALTER TABLE support_conversations DROP CONSTRAINT IF EXISTS support_conversations_identity_check;

DELETE FROM support_conversations WHERE channel = 'web';

ALTER TABLE support_conversations DROP COLUMN IF EXISTS web_token_hash;
ALTER TABLE support_conversations DROP COLUMN IF EXISTS channel;
ALTER TABLE support_conversations ALTER COLUMN chat_id SET NOT NULL;
