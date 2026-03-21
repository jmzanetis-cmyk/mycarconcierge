-- Migration: Create abandoned_signups table for tracking incomplete signups
-- Run this migration in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS abandoned_signups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('member', 'provider')),
    step VARCHAR(50) NOT NULL DEFAULT 'email',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recovered BOOLEAN DEFAULT FALSE,
    recovered_at TIMESTAMP WITH TIME ZONE,
    recovery_email_sent_at TIMESTAMP WITH TIME ZONE,
    recovery_email_count INTEGER DEFAULT 0,
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    user_agent TEXT,
    ip_address VARCHAR(45),
    UNIQUE(email, type)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_signups_recovered ON abandoned_signups(recovered, created_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_signups_email ON abandoned_signups(email);
CREATE INDEX IF NOT EXISTS idx_abandoned_signups_type ON abandoned_signups(type);

CREATE OR REPLACE FUNCTION update_abandoned_signups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_abandoned_signups_updated_at ON abandoned_signups;
CREATE TRIGGER trigger_abandoned_signups_updated_at
    BEFORE UPDATE ON abandoned_signups
    FOR EACH ROW
    EXECUTE FUNCTION update_abandoned_signups_updated_at();

ALTER TABLE abandoned_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can access all abandoned_signups" ON abandoned_signups;
CREATE POLICY "Service role can access all abandoned_signups" ON abandoned_signups
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view abandoned_signups" ON abandoned_signups;
CREATE POLICY "Admins can view abandoned_signups" ON abandoned_signups
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

COMMENT ON TABLE abandoned_signups IS 'Tracks users who started but did not complete the signup process';
