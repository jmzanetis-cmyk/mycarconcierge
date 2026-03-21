-- Provider Notification Preferences Migration
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS provider_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    push_enabled BOOLEAN DEFAULT false,
    push_subscription JSONB DEFAULT null,
    push_new_opportunities BOOLEAN DEFAULT true,
    push_appointment_reminders BOOLEAN DEFAULT true,
    push_payment_received BOOLEAN DEFAULT true,
    push_customer_messages BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_notification_preferences_provider_id 
    ON provider_notification_preferences(provider_id);

ALTER TABLE provider_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view own notification preferences"
    ON provider_notification_preferences
    FOR SELECT
    USING (auth.uid() = provider_id);

CREATE POLICY "Providers can update own notification preferences"
    ON provider_notification_preferences
    FOR UPDATE
    USING (auth.uid() = provider_id);

CREATE POLICY "Providers can insert own notification preferences"
    ON provider_notification_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Service role has full access to provider notification preferences"
    ON provider_notification_preferences
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE provider_notification_preferences IS 'Stores push notification preferences for service providers';
COMMENT ON COLUMN provider_notification_preferences.push_enabled IS 'Whether push notifications are enabled for this provider';
COMMENT ON COLUMN provider_notification_preferences.push_subscription IS 'Web push subscription object (endpoint, keys, etc.)';
COMMENT ON COLUMN provider_notification_preferences.push_new_opportunities IS 'Receive push for new service opportunities';
COMMENT ON COLUMN provider_notification_preferences.push_appointment_reminders IS 'Receive push for appointment reminders';
COMMENT ON COLUMN provider_notification_preferences.push_payment_received IS 'Receive push when payment is received';
COMMENT ON COLUMN provider_notification_preferences.push_customer_messages IS 'Receive push for new customer messages';
