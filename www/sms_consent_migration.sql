-- Add SMS consent fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_consent_date TIMESTAMPTZ;

-- Index for querying opted-in users
CREATE INDEX IF NOT EXISTS idx_profiles_sms_consent ON profiles(sms_consent) WHERE sms_consent = true;

-- Comment
COMMENT ON COLUMN profiles.sms_consent IS 'User has consented to receive SMS messages';
COMMENT ON COLUMN profiles.sms_consent_date IS 'Timestamp when SMS consent was given';
