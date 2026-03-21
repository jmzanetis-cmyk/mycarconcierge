-- Migration: Add QR Check-in Feature
-- Run this in your Supabase SQL Editor

-- Add qr_checkin_enabled to provider settings in profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS qr_checkin_enabled BOOLEAN DEFAULT FALSE;

-- Add check-in fields to maintenance_packages table
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS checkin_token VARCHAR(64);
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS checkin_token_expires_at TIMESTAMPTZ;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_packages_checkin_token ON maintenance_packages(checkin_token) WHERE checkin_token IS NOT NULL;

-- RLS policy for providers to view their own qr_checkin_enabled setting
CREATE POLICY IF NOT EXISTS "providers_update_own_qr_checkin" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
