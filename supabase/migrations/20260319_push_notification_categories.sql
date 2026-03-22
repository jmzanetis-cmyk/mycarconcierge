-- Add push notification category columns to member_notification_preferences
ALTER TABLE member_notification_preferences
  ADD COLUMN IF NOT EXISTS push_bid_alerts BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_vehicle_status BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_dream_car_matches BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_maintenance_reminders BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_bid_accepted BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_payment_released BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_appointment_reminder BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_ai_match BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_car_club BOOLEAN DEFAULT true;

-- Create provider_notification_preferences table if it doesn't exist
CREATE TABLE IF NOT EXISTS provider_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_bid_opportunities BOOLEAN DEFAULT true,
  push_appointment_reminders BOOLEAN DEFAULT true,
  push_payment_received BOOLEAN DEFAULT true,
  push_customer_messages BOOLEAN DEFAULT true,
  push_bid_accepted BOOLEAN DEFAULT true,
  push_ai_match BOOLEAN DEFAULT true,
  push_car_club BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider_id)
);

-- Add push columns to provider_notification_preferences if table already existed
ALTER TABLE provider_notification_preferences
  ADD COLUMN IF NOT EXISTS push_bid_opportunities BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_appointment_reminders BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_payment_received BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_customer_messages BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_bid_accepted BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_ai_match BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_car_club BOOLEAN DEFAULT true;

-- Enable RLS on provider_notification_preferences
ALTER TABLE provider_notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_notification_preferences'
    AND policyname = 'provider_can_view_own_notification_prefs'
  ) THEN
    CREATE POLICY provider_can_view_own_notification_prefs
      ON provider_notification_preferences FOR SELECT
      USING (auth.uid() = provider_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_notification_preferences'
    AND policyname = 'provider_can_update_own_notification_prefs'
  ) THEN
    CREATE POLICY provider_can_update_own_notification_prefs
      ON provider_notification_preferences FOR ALL
      USING (auth.uid() = provider_id)
      WITH CHECK (auth.uid() = provider_id);
  END IF;
END $$;
