-- Member Onboarding & Survey Schema
-- Run in Supabase SQL Editor

-- Survey responses (works for anonymous users too)
CREATE TABLE IF NOT EXISTS survey_responses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mech_satisfaction    text,   -- very_satisfied / hit_or_miss / not_satisfied / no_mechanic
  cosmetic_satisfaction text,  -- have_provider / fine_but_expensive / hard_to_find / skip_it
  pain_point           text,   -- cost / trust / communication / quality / scheduling
  improvement_priority text,   -- transparent_pricing / one_app / verified_providers / real_time_updates / competitive_bids
  provider_discovery   text,   -- word_of_mouth / google / stick_with_known / trial_error
  services_needed      text,   -- routine / repairs / cosmetic / all
  raw                  jsonb,
  ip_hash              text,   -- hashed IP for dedup (no PII stored)
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- If the table was already created with old columns, add the new ones and drop the old ones
-- (safe to run multiple times — all operations are idempotent)
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS mech_satisfaction    text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS cosmetic_satisfaction text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS improvement_priority  text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS provider_discovery    text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS services_needed       text;

-- Member onboarding checklist state
CREATE TABLE IF NOT EXISTS member_onboarding (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  checklist      jsonb NOT NULL DEFAULT '{}'::jsonb,
  survey_completed boolean NOT NULL DEFAULT false,
  welcome_shown  boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_survey_responses_user_id    ON survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_pain_point ON survey_responses(pain_point);
CREATE INDEX IF NOT EXISTS idx_survey_responses_created_at ON survey_responses(created_at DESC);

-- RLS
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_onboarding ENABLE ROW LEVEL SECURITY;

-- survey_responses: anyone can INSERT (anonymous submissions allowed)
-- SELECT is restricted to authenticated owners only; admin reads via service role key (bypasses RLS)
CREATE POLICY IF NOT EXISTS "Anyone can insert survey responses"
  ON survey_responses FOR INSERT
  WITH CHECK (true);

-- Only the owning authenticated user can view their own survey response
-- Anonymous (user_id IS NULL) rows are NOT accessible via RLS; admin API uses service_role
CREATE POLICY IF NOT EXISTS "Users can view own survey responses"
  ON survey_responses FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- member_onboarding: users access only their own row
CREATE POLICY IF NOT EXISTS "Users can read own onboarding"
  ON member_onboarding FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own onboarding"
  ON member_onboarding FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own onboarding"
  ON member_onboarding FOR UPDATE
  USING (auth.uid() = user_id);

-- Helper: update updated_at on member_onboarding upsert
CREATE OR REPLACE FUNCTION update_member_onboarding_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_onboarding_updated_at ON member_onboarding;
CREATE TRIGGER trg_member_onboarding_updated_at
  BEFORE UPDATE ON member_onboarding
  FOR EACH ROW EXECUTE FUNCTION update_member_onboarding_updated_at();
