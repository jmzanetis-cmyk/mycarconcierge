-- Discovery Survey & Lead Funnel Rethink (Task #96)
-- Adds discovery_answers JSONB column to survey_responses to store
-- per-question answers from the new 5-question discovery flow.
-- Also extends customer_profiles with first_name-only onboarding support
-- (last_name is now optional — made nullable below).
--
-- DEPENDENCY: Requires 20260328_prospect_survey.sql to have been applied first.

-- Add discovery_answers column to store the new discovery flow responses
ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS discovery_answers jsonb;

-- Add referral_code column for survey-generated waitlist referral links (Task #96)
ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_referral_code
  ON survey_responses(referral_code)
  WHERE referral_code IS NOT NULL;

-- discovery_answers shape:
-- {
--   "q1_find_mechanic":    ["word_of_mouth", "google_search", ...],
--   "q2_price_confidence": "no_idea" | "often_unsure" | "somewhat_unsure" | "mostly_confident" | "very_confident",
--   "q3_would_use":        "yes_definitely" | "sounds_interesting" | "probably_not",
--   "q4_matters_most":     ["transparent_pricing", "verified_reviews", ...],
--   "q5_hesitations":      ["trust_mechanics", "data_privacy", ...]
-- }

-- Index for discovery answer filtering/analytics
CREATE INDEX IF NOT EXISTS idx_survey_responses_discovery_answers
  ON survey_responses USING gin (discovery_answers)
  WHERE discovery_answers IS NOT NULL;

-- Make last_name nullable in customer_profiles (new flow only collects first name)
ALTER TABLE customer_profiles
  ALTER COLUMN last_name DROP NOT NULL;

-- Add auth_user_id to customer_profiles to link the shadow auth user created during referral generation.
-- When a prospect generates a referral link, a minimal auth user is created so a valid referrals row
-- (with referrer_id FK to auth.users) can be inserted. This auth_user_id bridges the pre-auth prospect
-- to the full auth account they complete at signup-member.html.
ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;

-- Index on (interested, discovery_answers is not null) for admin analytics
CREATE INDEX IF NOT EXISTS idx_survey_responses_interested_discovery
  ON survey_responses(interested, created_at DESC)
  WHERE discovery_answers IS NOT NULL;
