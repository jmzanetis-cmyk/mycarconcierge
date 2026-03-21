-- Stripe Identity Verification Migration
-- Allows vehicle ownership verification through Stripe Identity
-- 
-- IMPORTANT: Run this migration AFTER the main RLS_POLICIES.sql has been applied.
-- This migration modifies the vehicles INSERT policy to require identity verification.
-- Ensure the vehicles table has RLS enabled before running this migration.

-- Create identity_verifications table
CREATE TABLE IF NOT EXISTS identity_verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'requires_input', 'processing', 'canceled')),
    verified_at TIMESTAMPTZ,
    verified_name VARCHAR(255),
    document_type VARCHAR(50),
    verification_report_id VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_identity_verifications_user ON identity_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_session ON identity_verifications(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_status ON identity_verifications(user_id, status);

-- Enable RLS
ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for identity_verifications
DROP POLICY IF EXISTS "Users can view own identity verifications" ON identity_verifications;
CREATE POLICY "Users can view own identity verifications" ON identity_verifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own identity verifications" ON identity_verifications;
CREATE POLICY "Users can insert own identity verifications" ON identity_verifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own identity verifications" ON identity_verifications;
CREATE POLICY "Users can update own identity verifications" ON identity_verifications
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admin access policy
DROP POLICY IF EXISTS "Admins can view all identity verifications" ON identity_verifications;
CREATE POLICY "Admins can view all identity verifications" ON identity_verifications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update all identity verifications" ON identity_verifications;
CREATE POLICY "Admins can update all identity verifications" ON identity_verifications
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Service role policy for webhook updates
DROP POLICY IF EXISTS "Service role can manage all identity verifications" ON identity_verifications;
CREATE POLICY "Service role can manage all identity verifications" ON identity_verifications
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_identity_verifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_identity_verifications_updated_at ON identity_verifications;
CREATE TRIGGER trigger_identity_verifications_updated_at
    BEFORE UPDATE ON identity_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_identity_verifications_updated_at();

-- =====================================================
-- VEHICLE IDENTITY VERIFICATION ENFORCEMENT
-- These policies ensure only identity-verified users can add vehicles
-- =====================================================

-- Helper function to check if a user is identity verified
CREATE OR REPLACE FUNCTION is_identity_verified(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM identity_verifications 
        WHERE user_id = check_user_id 
        AND status = 'verified'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing vehicle insert policy if it exists (we'll replace it)
DROP POLICY IF EXISTS "Members can insert own vehicles" ON vehicles;
DROP POLICY IF EXISTS "Verified members can insert own vehicles" ON vehicles;

-- New policy: Only verified members can insert vehicles
-- This replaces any existing insert policy for vehicles
CREATE POLICY "Verified members can insert own vehicles" ON vehicles
    FOR INSERT WITH CHECK (
        auth.uid() = owner_id 
        AND is_identity_verified(auth.uid())
    );

-- Admin override: Admins can insert vehicles for any user (for support purposes)
DROP POLICY IF EXISTS "Admins can insert vehicles" ON vehicles;
CREATE POLICY "Admins can insert vehicles" ON vehicles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Add identity_verified column to vehicles table to track which vehicles
-- were added after verification (for display purposes)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vehicles' AND column_name = 'identity_verified_at_add'
    ) THEN
        ALTER TABLE vehicles ADD COLUMN identity_verified_at_add BOOLEAN DEFAULT false;
    END IF;
END $$;
