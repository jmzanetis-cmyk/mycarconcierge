-- Survey Responses — Backfill Missing Columns (Task #166)
-- The original 20260328_member_onboarding.sql had a missing-comma syntax bug
-- between `vehicle_count text` and `raw jsonb`, which prevented the initial
-- CREATE TABLE block from completing in environments that hadn't already
-- created survey_responses by some other path. This migration is a focused,
-- idempotent backfill that ensures every column the application reads/writes
-- actually exists in the live table. Safe to re-apply.
--
-- Run in Supabase SQL Editor.

-- Make sure the base table exists (no-op if it already does)
CREATE TABLE IF NOT EXISTS survey_responses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 22 question columns from the post-signup member survey
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

-- Supporting columns the insert path uses
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS raw     jsonb;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS ip_hash text;

-- Useful index for the analytics page's top-priority headline card
CREATE INDEX IF NOT EXISTS idx_survey_responses_top_priority ON survey_responses(top_priority);
CREATE INDEX IF NOT EXISTS idx_survey_responses_created_at   ON survey_responses(created_at DESC);

-- RLS — enable + ensure the same policies the app expects exist
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'survey_responses'
      AND policyname = 'Anyone can insert survey responses'
  ) THEN
    CREATE POLICY "Anyone can insert survey responses"
      ON survey_responses FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'survey_responses'
      AND policyname = 'Users can view own survey responses'
  ) THEN
    CREATE POLICY "Users can view own survey responses"
      ON survey_responses FOR SELECT
      USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);
  END IF;
END $$;
