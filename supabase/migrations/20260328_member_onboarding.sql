-- Member Onboarding & Survey Schema
-- Run in Supabase SQL Editor

-- Survey responses (works for anonymous users too)
CREATE TABLE IF NOT EXISTS survey_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source       text,          -- how they heard about MCC
  pain_point   text,          -- biggest car care frustration
  has_trusted_mechanic text,  -- yes / sometimes / no / new
  vehicle_count text,         -- 1 / 2 / 3 / fleet
  raw          jsonb,
  ip_hash      text,          -- hashed IP for dedup (no PII stored)
  created_at   timestamptz NOT NULL DEFAULT now()
);

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
CREATE INDEX IF NOT EXISTS idx_survey_responses_user_id ON survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_source ON survey_responses(source);
CREATE INDEX IF NOT EXISTS idx_survey_responses_pain_point ON survey_responses(pain_point);
CREATE INDEX IF NOT EXISTS idx_survey_responses_created_at ON survey_responses(created_at DESC);

-- RLS
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_onboarding ENABLE ROW LEVEL SECURITY;

-- survey_responses: users can insert anonymously or view their own; admin via service role
CREATE POLICY "Users can insert survey responses"
  ON survey_responses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view own survey responses"
  ON survey_responses FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- member_onboarding: users access only their own row
CREATE POLICY "Users can read own onboarding"
  ON member_onboarding FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding"
  ON member_onboarding FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding"
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
