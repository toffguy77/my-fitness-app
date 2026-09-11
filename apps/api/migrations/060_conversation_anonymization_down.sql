DROP INDEX IF EXISTS idx_conversations_live_pair;

-- Restoring the constraint can fail when a curator has more than one erased
-- client, which is exactly the state this migration exists to allow. Those rows
-- have to be resolved by hand before rolling back.
ALTER TABLE conversations ADD CONSTRAINT conversations_client_id_curator_id_key
  UNIQUE (client_id, curator_id);

ALTER TABLE conversations DROP COLUMN IF EXISTS anonymized_at;
