-- Push Notifications Migration
-- Run this in Supabase SQL Editor
-- This adds push notification columns to the existing member_notification_preferences table

-- Add push notification columns to member_notification_preferences
ALTER TABLE member_notification_preferences
ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS push_subscription JSONB DEFAULT null,
ADD COLUMN IF NOT EXISTS push_bid_alerts BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS push_vehicle_status BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS push_payment_updates BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS push_dream_car_matches BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS push_maintenance_reminders BOOLEAN DEFAULT true;

-- Update existing rows to have default values for push columns
UPDATE member_notification_preferences
SET push_enabled = COALESCE(push_enabled, false),
    push_bid_alerts = COALESCE(push_bid_alerts, true),
    push_vehicle_status = COALESCE(push_vehicle_status, true),
    push_payment_updates = COALESCE(push_payment_updates, true),
    push_dream_car_matches = COALESCE(push_dream_car_matches, true),
    push_maintenance_reminders = COALESCE(push_maintenance_reminders, true)
WHERE push_enabled IS NULL;

-- Function to check if user wants a specific push notification type
CREATE OR REPLACE FUNCTION should_send_push_notification(
    p_member_id UUID,
    p_type TEXT      -- 'bid_alerts', 'vehicle_status', 'payment_updates', 'dream_car_matches', 'maintenance_reminders'
)
RETURNS BOOLEAN AS $$
DECLARE
    prefs member_notification_preferences%ROWTYPE;
BEGIN
    SELECT * INTO prefs FROM member_notification_preferences WHERE member_id = p_member_id;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    IF NOT COALESCE(prefs.push_enabled, false) THEN
        RETURN false;
    END IF;
    
    CASE p_type
        WHEN 'bid_alerts' THEN RETURN COALESCE(prefs.push_bid_alerts, true);
        WHEN 'vehicle_status' THEN RETURN COALESCE(prefs.push_vehicle_status, true);
        WHEN 'payment_updates' THEN RETURN COALESCE(prefs.push_payment_updates, true);
        WHEN 'dream_car_matches' THEN RETURN COALESCE(prefs.push_dream_car_matches, true);
        WHEN 'maintenance_reminders' THEN RETURN COALESCE(prefs.push_maintenance_reminders, true);
        ELSE RETURN true;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment for documentation
COMMENT ON FUNCTION should_send_push_notification IS 'Checks if a member has enabled a specific push notification type';
