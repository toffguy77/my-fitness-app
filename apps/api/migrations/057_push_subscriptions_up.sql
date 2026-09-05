-- Where a browser can be reached with a push.
--
-- The endpoint is the address the push service gave this browser; it is unique,
-- so the same browser re-subscribing updates its row rather than accumulating
-- rows nobody will ever clean up.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT        NOT NULL UNIQUE,
    -- The two keys the Web Push encryption needs. Without them a push can be
    -- delivered but not read.
    p256dh      TEXT        NOT NULL,
    auth        TEXT        NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- When the push service last accepted something for this endpoint. A
    -- subscription that has not worked for months is a dead browser.
    last_used_at TIMESTAMPTZ,
    -- Consecutive failures. A push service answering 404 or 410 means the
    -- subscription is gone for good and the row is deleted immediately; this
    -- counts the softer failures.
    failures    INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON push_subscriptions (user_id);

DO $$ BEGIN
    EXECUTE 'GRANT ALL ON TABLE push_subscriptions TO PUBLIC';
    EXECUTE 'GRANT ALL ON SEQUENCE push_subscriptions_id_seq TO PUBLIC';
END $$;
