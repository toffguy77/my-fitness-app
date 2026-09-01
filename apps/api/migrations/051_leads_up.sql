-- Migration: Onboarding leads
-- Version: 051
--
-- Somebody who worked through the onboarding and stopped at the registration
-- form used to vanish completely: no contact, no parameters, no record of where
-- they stopped. There was nothing to write to and nobody to write about.
--
-- A row appears here only once the person has left a contact together with an
-- explicit consent. Body parameters are health data; storing an anonymous
-- visitor's before that would be processing without a basis.

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact. The address they gave here need not be the one they eventually
  -- register with.
  email TEXT NOT NULL,
  name TEXT,

  -- What they told the wizard, and what it computed from it. Kept so the
  -- registration that follows does not ask the same questions twice.
  sex TEXT,
  birth_date DATE,
  height_cm NUMERIC(5,1),
  weight_kg NUMERIC(5,1),
  activity_level TEXT,
  goal TEXT,
  calories NUMERIC(7,1),
  protein NUMERIC(6,1),
  fat NUMERIC(6,1),
  carbs NUMERIC(6,1),
  water_glasses INTEGER,

  -- Where they stopped, so a curator sees what to say rather than a blank.
  last_step TEXT NOT NULL DEFAULT 'contact',
  -- Where they came from, for judging which channels bring people who finish.
  source TEXT,

  -- Separate on purpose: saving the lead needs the first, writing to them needs
  -- the second. Bundled, neither is an explicit choice.
  data_consent BOOLEAN NOT NULL DEFAULT false,
  contact_consent BOOLEAN NOT NULL DEFAULT false,

  -- One reminder, ever.
  reminder_sent_at TIMESTAMPTZ,
  -- A curator marking that they have dealt with this person.
  handled_at TIMESTAMPTZ,
  handled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The reminder job walks unhandled leads by age.
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_reminder ON leads(reminder_sent_at, contact_consent);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

-- A guest's consents live with their lead until they register, at which point
-- they move onto the account.
ALTER TABLE user_consents ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_consent_type_check;
ALTER TABLE user_consents ADD CONSTRAINT user_consents_consent_type_check
  CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'data_processing', 'marketing', 'contact'));
-- A consent belongs to exactly one of the two.
ALTER TABLE user_consents DROP CONSTRAINT IF EXISTS user_consents_subject_check;
ALTER TABLE user_consents ADD CONSTRAINT user_consents_subject_check
  CHECK ((user_id IS NOT NULL) <> (lead_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_user_consents_lead_id ON user_consents(lead_id);

COMMENT ON TABLE leads IS 'People who went through the onboarding and left a contact without registering';
COMMENT ON COLUMN leads.last_step IS 'Where they stopped, so the follow-up knows what to say';
