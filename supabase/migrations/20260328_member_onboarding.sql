-- Member Onboarding & Survey Schema
-- Run in Supabase SQL Editor

-- Survey responses (works for anonymous users too)
CREATE TABLE IF NOT EXISTS survey_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_discovery    text,   -- word_of_mouth / online_search / stick_with_known / trial_error
  provider_satisfaction text,   -- very_satisfied / somewhat_satisfied / not_satisfied / avoid_service
  service_frequency     text,   -- monthly_plus / few_times_year / once_a_year / only_problems
  service_types         text,   -- routine / repairs / cosmetic / mixed
  pricing_confidence    text,   -- very_fair / mostly_fair / not_sure / not_fair
  estimate_surprise     text,   -- yes_regularly / yes_once / rarely / never
  quote_behavior        text,   -- trust_one / compare_few / online_research / just_pay
  provider_honesty      text,   -- very_honest / mostly_honest / skeptical / very_skeptical
  provider_vetting      text,   -- yes_nervous / yes_went_anyway / rarely / never
  history_tracking      text,   -- no_system / manual / mechanic_tracks / app
  maintenance_avoidance text,   -- yes_regularly / yes_sometimes / rarely / never
  job_status_updates    text,   -- i_call / they_call / just_show_up / has_system
  maintenance_reminders text,   -- from_shop / self_set / no_try_to_remember / dashboard_light
  competitive_bids      text,   -- love_it / open_to_it / unsure / prefer_one_shop
  app_usage             text,   -- yes_regularly / tried_none_stuck / no_old_fashioned / didnt_know
  payment_comfort       text,   -- very_comfortable / open_to_it / prefer_in_person / not_comfortable
  dispute_history       text,   -- yes_hard_to_resolve / yes_resolved / concerns_not_voiced / never
  annual_spend          text,   -- under_500 / 500_to_1500 / 1500_to_3000 / over_3000
  decision_maker        text,   -- yes_primary / shared / mostly_me / not_me
  near_term_need        text,   -- yes_urgent / yes_routine / not_right_now / no_need
  top_priority          text,   -- trust / pricing / convenience / quality / proximity
  vehicle_count         text    -- 1 / 2 / 3plus
  raw                   jsonb,
  ip_hash               text,   -- hashed IP for dedup (no PII stored)
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column additions for environments already running an older schema
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS provider_discovery    text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS provider_satisfaction text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS service_frequency     text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS service_types         text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS pricing_confidence    text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS estimate_surprise     text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS quote_behavior        text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS provider_honesty      text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS provider_vetting      text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS history_tracking      text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS maintenance_avoidance text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS job_status_updates    text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS maintenance_reminders text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS competitive_bids      text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS app_usage             text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS payment_comfort       text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS dispute_history       text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS annual_spend          text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS decision_maker        text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS near_term_need        text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS top_priority          text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS vehicle_count         text;

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
