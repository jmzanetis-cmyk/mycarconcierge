-- Emergency Dispatch Migration for My Car Concierge
-- Adds emergency_settings column to profiles table for providers

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS emergency_settings JSONB DEFAULT '{
  "available": false,
  "status": "off_duty",
  "busyEta": 30,
  "serviceRadius": 25,
  "specializations": [],
  "responseTimeMinutes": 30,
  "rushMultiplier": 1.5,
  "autoDeclineMinutes": 5
}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_profiles_emergency_available 
ON profiles ((emergency_settings->>'available')) 
WHERE emergency_settings IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_emergency_status 
ON profiles ((emergency_settings->>'status')) 
WHERE emergency_settings IS NOT NULL;

COMMENT ON COLUMN profiles.emergency_settings IS 'Emergency dispatch settings for roadside/tow providers';
