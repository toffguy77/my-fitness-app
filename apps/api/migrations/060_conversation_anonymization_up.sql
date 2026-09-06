-- A conversation whose client has been erased points at the placeholder
-- account. UNIQUE(client_id, curator_id) then allowed a curator to lose only
-- one client ever: the second erasure collided with the first and failed, and
-- an erasure that fails is an erasure that never happens — the job gives up on
-- the whole account and the person stays in the database.
--
-- The constraint is still wanted for live conversations (one per pair), so it
-- becomes a partial index and anonymised rows step out of it.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- Existing anonymised rows, if any: the placeholder is the only client that can
-- appear more than once.
UPDATE conversations c
SET anonymized_at = NOW()
FROM users u
WHERE u.id = c.client_id AND u.is_system = true AND c.anonymized_at IS NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_client_id_curator_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_live_pair
  ON conversations (client_id, curator_id) WHERE anonymized_at IS NULL;
