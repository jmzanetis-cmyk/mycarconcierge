-- =====================================================
-- MY CAR CONCIERGE - APPOINTMENT REMINDERS MIGRATION
-- Run this script in Supabase SQL Editor
-- Adds SMS reminder tracking to service_appointments table
-- =====================================================

-- Add reminder tracking columns to service_appointments
ALTER TABLE service_appointments
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Create index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_service_appointments_reminder 
ON service_appointments(reminder_sent, status, confirmed_date)
WHERE reminder_sent = false AND status = 'confirmed';

-- Comment for documentation
COMMENT ON COLUMN service_appointments.reminder_sent IS 'Whether SMS reminder was sent for this appointment';
COMMENT ON COLUMN service_appointments.reminder_sent_at IS 'Timestamp when reminder SMS was sent';
