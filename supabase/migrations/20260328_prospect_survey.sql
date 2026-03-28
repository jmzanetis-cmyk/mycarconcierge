-- Prospect Survey & Lead Capture Flow (Task #93)
-- Extends survey_responses for prospect (pre-signup) data and adds customer_profiles + job_listings

-- Add prospect-specific columns to survey_responses
-- (existing member rows have user_id set and feature_ratings/email NULL — prospect rows have user_id NULL and feature_ratings set)
ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS email          text,
  ADD COLUMN IF NOT EXISTS first_name     text,
  ADD COLUMN IF NOT EXISTS last_name      text,
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS zip            text,
  ADD COLUMN IF NOT EXISTS interested     boolean,
  ADD COLUMN IF NOT EXISTS feature_ratings jsonb,
  ADD COLUMN IF NOT EXISTS session_id     text;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_survey_responses_email        ON survey_responses(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_survey_responses_interested   ON survey_responses(interested) WHERE interested IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_survey_responses_session_id   ON survey_responses(session_id) WHERE session_id IS NOT NULL;

-- Customer profiles: full profile submitted by interested prospects
CREATE TABLE IF NOT EXISTS customer_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_response_id  uuid REFERENCES survey_responses(id) ON DELETE SET NULL,
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  email               text NOT NULL,
  phone               text,
  zip                 text,
  vehicle_year        text,
  vehicle_make        text,
  vehicle_model       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_email              ON customer_profiles(email);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_created_at         ON customer_profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_survey_response_id ON customer_profiles(survey_response_id);

-- Job listings: first job submitted by the prospect during survey
CREATE TABLE IF NOT EXISTS job_listings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id uuid REFERENCES customer_profiles(id) ON DELETE CASCADE,
  service_type        text,
  vehicle_description text,
  issue_description   text,
  urgency             text,        -- 'asap' | 'this_week' | 'this_month' | 'just_curious'
  zip                 text,
  budget_range        text,        -- 'under_100' | '100_500' | '500_1000' | '1000_plus' | 'unsure'
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_listings_customer_profile_id ON job_listings(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_created_at          ON job_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_listings_service_type        ON job_listings(service_type);

-- RLS for new tables (admin reads via service_role; public cannot SELECT these)
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_listings       ENABLE ROW LEVEL SECURITY;

-- No public SELECT on customer_profiles or job_listings (admin reads via service_role which bypasses RLS)
-- Allow INSERT from any source (public survey submissions)
CREATE POLICY "Public can insert customer profiles"
  ON customer_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can insert job listings"
  ON job_listings FOR INSERT
  WITH CHECK (true);
