-- Migration: Add missing columns causing database error flood
-- Run this in Supabase SQL Editor after database restarts
-- No is_suspended needed - code already fixed to use existing 'suspended' column

-- 1. profiles.suspended_at (used in admin.js and providers.js for tracking suspension timestamps)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- 2. profiles.application_status (used in server.js for filtering approved providers)
-- Default NULL so new profiles don't auto-approve; existing providers need backfill below
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS application_status text;

-- 3. maintenance_packages.member_confirmed_at (used in server.js for package completion)
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS member_confirmed_at timestamptz;

-- 4. provider_reviews.overall_rating (used in admin.js and providers.js)
ALTER TABLE provider_reviews ADD COLUMN IF NOT EXISTS overall_rating numeric;

-- 5. maintenance_reminders.service_date (used in server.js for reminder creation)
ALTER TABLE maintenance_reminders ADD COLUMN IF NOT EXISTS service_date date;

-- Backfill: Mark existing active providers as approved
UPDATE profiles SET application_status = 'approved' WHERE role = 'provider' AND suspended = false AND application_status IS NULL;
