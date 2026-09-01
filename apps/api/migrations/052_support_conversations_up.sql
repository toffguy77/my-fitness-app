-- Migration: Support conversations
-- Version: 052
--
-- Support before registration did not exist: the chat with a curator needs an
-- account and an assigned curator, so somebody with a question on the landing
-- page had an email address in the footer and nothing else.

CREATE TABLE IF NOT EXISTS support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Telegram's own chat identifier: one conversation per chat.
  chat_id BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,
  telegram_name TEXT,

  -- Set when the person arrived through a deep link carrying their lead, so an
  -- operator can see where they got stuck without asking again.
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  -- Set when the chat belongs to somebody who already has an account; the bot
  -- then sends anything about their plan to their curator instead.
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- open | escalated | closed
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'escalated', 'closed')),
  -- Why a human was asked for: the person said so, or the bot refused.
  escalation_reason TEXT,
  escalated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  -- user | bot | operator
  author TEXT NOT NULL CHECK (author IN ('user', 'bot', 'operator')),
  text TEXT NOT NULL,
  -- The operator who wrote it, when a person did.
  operator_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
  ON support_messages(conversation_id, created_at);
-- The operator queue: escalated first, oldest first.
CREATE INDEX IF NOT EXISTS idx_support_conversations_status
  ON support_conversations(status, escalated_at);
CREATE INDEX IF NOT EXISTS idx_support_conversations_last_message
  ON support_conversations(last_message_at);

COMMENT ON TABLE support_conversations IS 'Telegram support chats, before and during registration';
COMMENT ON COLUMN support_conversations.lead_id IS 'Set when the chat was opened from a saved onboarding attempt';
