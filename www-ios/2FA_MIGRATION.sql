-- 2FA (Two-Factor Authentication) Migration for My Car Concierge
-- This migration adds SMS-based two-factor authentication fields to the profiles table

-- Add 2FA columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
ADD COLUMN IF NOT EXISTS two_factor_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- Create index for faster lookups on 2FA-enabled users
CREATE INDEX IF NOT EXISTS idx_profiles_two_factor_enabled ON profiles(two_factor_enabled) WHERE two_factor_enabled = true;

-- Add comment to document the columns
COMMENT ON COLUMN profiles.phone IS 'Phone number for SMS-based 2FA (format: +1XXXXXXXXXX)';
COMMENT ON COLUMN profiles.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN profiles.two_factor_secret IS 'Hashed temporary verification code for 2FA';
COMMENT ON COLUMN profiles.two_factor_expires_at IS 'When the current 2FA verification code expires';
COMMENT ON COLUMN profiles.phone_verified IS 'Whether the phone number has been verified via SMS';

-- Rate limiting table for 2FA
CREATE TABLE IF NOT EXISTS two_factor_rate_limits (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'send_code' or 'verify_code'
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, action_type)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON two_factor_rate_limits(user_id, action_type);

-- RLS policies
ALTER TABLE two_factor_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access (server-side only)
CREATE POLICY "Service role access only" ON two_factor_rate_limits
  USING (false)  -- No user can select
  WITH CHECK (false);  -- No user can insert/update/delete
