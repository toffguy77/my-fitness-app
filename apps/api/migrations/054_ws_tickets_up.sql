-- Migration: WebSocket tickets
-- Version: 054
--
-- The chat socket authenticated with the access token in the query string.
-- A URL is the least private place a credential can be: it reaches proxy logs,
-- server logs, browser history and any Referer header, and the token it carried
-- was good for hours against the whole API.
--
-- A ticket is good for thirty seconds, for one connection, and for nothing else.

CREATE TABLE IF NOT EXISTS ws_tickets (
  -- The ticket itself is never stored, only its hash: a leaked table is then
  -- not a set of usable tickets.
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  -- Set the moment it is redeemed; a second attempt finds it used.
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ws_tickets_expires_at ON ws_tickets(expires_at);

COMMENT ON TABLE ws_tickets IS 'Single-use, seconds-long credentials for opening a chat socket';
