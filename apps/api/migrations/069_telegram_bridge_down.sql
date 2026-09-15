ALTER TABLE support_conversations DROP COLUMN IF EXISTS answered_at;
DROP TABLE IF EXISTS support_topics;
DROP TABLE IF EXISTS telegram_link_tickets;
DROP TABLE IF EXISTS telegram_links;
