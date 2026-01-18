-- Platform Settings Migration
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS platform_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(setting_key);

INSERT INTO platform_settings (setting_key, setting_value, description)
VALUES 
  ('checkr_enabled', '{"enabled": false}', 'Enable Checkr background checks for provider employees'),
  ('resend_enabled', '{"enabled": true}', 'Enable Resend email service'),
  ('twilio_enabled', '{"enabled": true}', 'Enable Twilio SMS service'),
  ('stripe_enabled', '{"enabled": true}', 'Enable Stripe payment processing'),
  ('marketplace_enabled', '{"enabled": true}', 'Enable parts marketplace'),
  ('require_parts_before_bid', '{"enabled": true}', 'Require members to select parts before providers bid')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view platform settings" ON platform_settings;
CREATE POLICY "Admins can view platform settings"
  ON platform_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update platform settings" ON platform_settings;
CREATE POLICY "Admins can update platform settings"
  ON platform_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE OR REPLACE FUNCTION update_platform_setting(p_key VARCHAR, p_value JSONB)
RETURNS void AS $$
BEGIN
  UPDATE platform_settings 
  SET setting_value = p_value, 
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE setting_key = p_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
