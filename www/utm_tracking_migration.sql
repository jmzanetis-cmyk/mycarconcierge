-- UTM Tracking Columns Migration for Supabase
-- Run this in your Supabase SQL editor to enable UTM tracking on signups

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS utm_source TEXT,
ADD COLUMN IF NOT EXISTS utm_medium TEXT,
ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS utm_content TEXT,
ADD COLUMN IF NOT EXISTS utm_term TEXT,
ADD COLUMN IF NOT EXISTS referral_source TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_utm_source ON profiles(utm_source);
CREATE INDEX IF NOT EXISTS idx_profiles_utm_campaign ON profiles(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_source ON profiles(referral_source);

COMMENT ON COLUMN profiles.utm_source IS 'UTM source parameter (e.g., google, facebook, email)';
COMMENT ON COLUMN profiles.utm_medium IS 'UTM medium parameter (e.g., cpc, social, email)';
COMMENT ON COLUMN profiles.utm_campaign IS 'UTM campaign parameter (e.g., summer_sale, founder_launch)';
COMMENT ON COLUMN profiles.utm_content IS 'UTM content parameter for A/B testing';
COMMENT ON COLUMN profiles.utm_term IS 'UTM term parameter for paid keywords';
COMMENT ON COLUMN profiles.referral_source IS 'Custom referral source from ref= parameter';
