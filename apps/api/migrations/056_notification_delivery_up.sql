-- Notifications could only ever appear inside the application. Somebody who
-- is not looking at it — which is most of the time — was told nothing at all.
-- This adds the delivery layer: which channels an event may use, when they
-- may use them, and what happened to each attempt.

-- The preference matrix: event type × channel.
--
-- A missing row means "the default for that type", so adding a new event type
-- does not mean writing a row for every user who ever registered. Only a
-- deliberate choice is stored.
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT        NOT NULL,
    channel    TEXT        NOT NULL CHECK (channel IN ('app', 'email', 'push')),
    enabled    BOOLEAN     NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, type, channel)
);

-- One row per (notification, channel). The application channel is recorded too,
-- so "was this person told, and how" has a single answer rather than one
-- answer in this table and another implied by the notifications table.
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id              BIGSERIAL   PRIMARY KEY,
    notification_id UUID        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel         TEXT        NOT NULL CHECK (channel IN ('app', 'email', 'push')),
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempts        INT         NOT NULL DEFAULT 0,
    -- Quiet hours move this forward instead of dropping the notice.
    not_before      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (notification_id, channel)
);

-- The sender's only query: what is due now.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
    ON notification_deliveries (not_before)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
    ON notification_deliveries (user_id, created_at DESC);

-- Quiet hours, as local hours-of-day in the user's own timezone (users.timezone
-- already exists). NULL on either side means "no quiet hours".
ALTER TABLE users ADD COLUMN IF NOT EXISTS quiet_hours_start SMALLINT
    CHECK (quiet_hours_start BETWEEN 0 AND 23);
ALTER TABLE users ADD COLUMN IF NOT EXISTS quiet_hours_end SMALLINT
    CHECK (quiet_hours_end BETWEEN 0 AND 23);

-- One link at the bottom of every digest turns off every email at once. It has
-- to work without signing in — an unsubscribe that demands a password is not
-- an unsubscribe.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_unsubscribed_at TIMESTAMPTZ;

-- Carrying the existing choices over.
--
-- The old table records content opt-outs per content category, which the new
-- matrix (per event type) cannot express without losing that granularity — so
-- it stays where it is and keeps deciding whether a new_content notification is
-- created at all. What does carry over is the global mute: somebody who
-- silenced content notices should not start receiving them by email now.
INSERT INTO notification_preferences (user_id, type, channel, enabled)
SELECT user_id, 'new_content', channel, FALSE
FROM content_notification_mute
CROSS JOIN (VALUES ('email'), ('push')) AS c(channel)
ON CONFLICT DO NOTHING;

DO $$ BEGIN
    EXECUTE 'GRANT ALL ON TABLE notification_preferences TO PUBLIC';
    EXECUTE 'GRANT ALL ON TABLE notification_deliveries TO PUBLIC';
    EXECUTE 'GRANT ALL ON SEQUENCE notification_deliveries_id_seq TO PUBLIC';
END $$;
