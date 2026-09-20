-- email_verification_codes served exactly one purpose until account deletion
-- started using the same mechanism: confirming an address. latestUnusedCode
-- picked "the most recent code for this user", with nothing recording what it
-- was issued for — so a code sent to confirm an e-mail address could confirm
-- an account's deletion instead, and the other way round. Review found this
-- before it shipped: the whole point of asking a passwordless account for a
-- mailed code is a second proof distinct from the session, and any
-- outstanding code answering "is this a real code sent to this mailbox"
-- defeats that.
--
-- Existing rows are all email_verification: nothing else issued a code before
-- this migration, so the default backfills them correctly rather than as a
-- guess.
ALTER TABLE email_verification_codes
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'email_verification'
  CHECK (purpose IN ('email_verification', 'account_deletion'));
