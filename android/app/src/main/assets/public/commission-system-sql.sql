-- My Car Concierge - Commission Tracking System
-- Run these SQL statements in your Supabase SQL Editor

-- ============================================
-- DRIVER CERTIFICATION SYSTEM
-- ============================================

-- Add driver certification fields to team_members table
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_driver BOOLEAN DEFAULT false;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS driver_license_number TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS driver_license_state TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS driver_license_expiry DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS driver_license_photo_url TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS driver_license_back_url TEXT;

-- Background check fields (Checkr integration)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS background_check_status TEXT DEFAULT 'not_started' 
    CHECK (background_check_status IN ('not_started', 'pending', 'in_progress', 'clear', 'consider', 'suspended', 'expired'));
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS background_check_id TEXT; -- Checkr candidate ID
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS background_check_report_id TEXT; -- Checkr report ID
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS background_check_invitation_id TEXT; -- Checkr invitation ID
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS background_check_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS background_check_expires_at TIMESTAMP WITH TIME ZONE;

-- MVR (Motor Vehicle Report) specific fields
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS mvr_status TEXT DEFAULT 'not_started'
    CHECK (mvr_status IN ('not_started', 'pending', 'clear', 'consider', 'suspended'));
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS mvr_completed_at TIMESTAMP WITH TIME ZONE;

-- Driver certification status (combined result)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS driver_certified BOOLEAN DEFAULT false;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS driver_certified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS driver_certification_notes TEXT;

-- Create index for faster driver lookups
CREATE INDEX IF NOT EXISTS idx_team_members_driver ON team_members(provider_id, is_driver, driver_certified);

-- ============================================

-- 1. Member Founder Profiles (approved founders with referral codes)
CREATE TABLE IF NOT EXISTS member_founder_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES member_founder_applications(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    location TEXT,
    referral_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    
    -- Payout information
    payout_method TEXT DEFAULT 'paypal' CHECK (payout_method IN ('paypal', 'venmo', 'zelle', 'bank_transfer', 'check', 'stripe_connect')),
    payout_email TEXT,
    payout_details JSONB DEFAULT '{}',
    
    -- Stripe Connect Express integration
    stripe_connect_account_id TEXT,
    
    -- Lifetime stats
    total_provider_referrals INTEGER DEFAULT 0,
    total_member_referrals INTEGER DEFAULT 0,
    total_commissions_earned DECIMAL(10,2) DEFAULT 0,
    total_commissions_paid DECIMAL(10,2) DEFAULT 0,
    pending_balance DECIMAL(10,2) DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration: Add stripe_connect_account_id to existing table if it exists
ALTER TABLE member_founder_profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

-- Migration: Update payout_method check constraint to include stripe_connect
DO $$
BEGIN
    ALTER TABLE member_founder_profiles DROP CONSTRAINT IF EXISTS member_founder_profiles_payout_method_check;
    ALTER TABLE member_founder_profiles ADD CONSTRAINT member_founder_profiles_payout_method_check 
        CHECK (payout_method IN ('paypal', 'venmo', 'zelle', 'bank_transfer', 'check', 'stripe_connect'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. Founder Referrals (tracks who referred whom)
CREATE TABLE IF NOT EXISTS founder_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    founder_id UUID NOT NULL REFERENCES member_founder_profiles(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    referred_type TEXT NOT NULL CHECK (referred_type IN ('provider', 'member')),
    referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    referred_email TEXT,
    referred_name TEXT,
    
    -- For providers specifically
    provider_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Founder Commissions (individual commission records)
CREATE TABLE IF NOT EXISTS founder_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    founder_id UUID NOT NULL REFERENCES member_founder_profiles(id) ON DELETE CASCADE,
    referral_id UUID REFERENCES founder_referrals(id) ON DELETE SET NULL,
    
    commission_type TEXT NOT NULL CHECK (commission_type IN ('bid_pack', 'platform_fee')),
    source_transaction_id TEXT,
    
    -- Original transaction details
    original_amount DECIMAL(10,2) NOT NULL,
    commission_rate DECIMAL(5,4) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    
    -- Link to payout when paid
    payout_id UUID REFERENCES founder_payouts(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Founder Payouts (monthly payout records)
CREATE TABLE IF NOT EXISTS founder_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    founder_id UUID NOT NULL REFERENCES member_founder_profiles(id) ON DELETE CASCADE,
    
    payout_period TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    
    payout_method TEXT NOT NULL,
    payout_details JSONB DEFAULT '{}',
    
    -- Stripe Connect transfer tracking
    stripe_transfer_id TEXT,
    
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES auth.users(id),
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration: Add stripe_transfer_id to existing table if it exists
ALTER TABLE founder_payouts ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

-- Now add the foreign key for founder_commissions.payout_id (circular reference fix)
-- ALTER TABLE founder_commissions ADD CONSTRAINT fk_payout FOREIGN KEY (payout_id) REFERENCES founder_payouts(id) ON DELETE SET NULL;

-- 5. Add referral_code column to profiles table for providers
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by_founder_id UUID REFERENCES member_founder_profiles(id);

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_founder_profiles_referral_code ON member_founder_profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_founder_profiles_email ON member_founder_profiles(email);
CREATE INDEX IF NOT EXISTS idx_founder_referrals_founder_id ON founder_referrals(founder_id);
CREATE INDEX IF NOT EXISTS idx_founder_referrals_code ON founder_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_founder_commissions_founder_id ON founder_commissions(founder_id);
CREATE INDEX IF NOT EXISTS idx_founder_commissions_status ON founder_commissions(status);
CREATE INDEX IF NOT EXISTS idx_founder_payouts_founder_id ON founder_payouts(founder_id);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by_founder_id);

-- 7. Row Level Security Policies

-- member_founder_profiles RLS
ALTER TABLE member_founder_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founders can view own profile" ON member_founder_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Founders can update own profile" ON member_founder_profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all founder profiles" ON member_founder_profiles
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Anyone can lookup referral codes" ON member_founder_profiles
    FOR SELECT USING (true);

-- founder_referrals RLS
ALTER TABLE founder_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founders can view own referrals" ON founder_referrals
    FOR SELECT USING (founder_id IN (SELECT id FROM member_founder_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all referrals" ON founder_referrals
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "System can insert referrals" ON founder_referrals
    FOR INSERT WITH CHECK (true);

-- founder_commissions RLS
ALTER TABLE founder_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founders can view own commissions" ON founder_commissions
    FOR SELECT USING (founder_id IN (SELECT id FROM member_founder_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all commissions" ON founder_commissions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "System can insert commissions" ON founder_commissions
    FOR INSERT WITH CHECK (true);

-- founder_payouts RLS
ALTER TABLE founder_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founders can view own payouts" ON founder_payouts
    FOR SELECT USING (founder_id IN (SELECT id FROM member_founder_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all payouts" ON founder_payouts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 8. Helper function to generate unique referral codes
CREATE OR REPLACE FUNCTION generate_referral_code(founder_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base_code TEXT;
    final_code TEXT;
    counter INTEGER := 0;
BEGIN
    base_code := UPPER(SUBSTRING(REGEXP_REPLACE(founder_name, '[^a-zA-Z]', '', 'g') FROM 1 FOR 4));
    IF LENGTH(base_code) < 4 THEN
        base_code := base_code || 'MCC';
    END IF;
    base_code := SUBSTRING(base_code FROM 1 FOR 4);
    
    final_code := base_code || TO_CHAR(FLOOR(RANDOM() * 9000 + 1000)::INTEGER, 'FM0000');
    
    WHILE EXISTS (SELECT 1 FROM member_founder_profiles WHERE referral_code = final_code) LOOP
        counter := counter + 1;
        final_code := base_code || TO_CHAR(FLOOR(RANDOM() * 9000 + 1000)::INTEGER, 'FM0000');
        IF counter > 100 THEN
            final_code := base_code || TO_CHAR(NOW(), 'MMDDHHMI');
            EXIT;
        END IF;
    END LOOP;
    
    RETURN final_code;
END;
$$ LANGUAGE plpgsql;

-- 9. Function to calculate and record commission from bid pack purchase
CREATE OR REPLACE FUNCTION record_bid_pack_commission(
    p_provider_id UUID,
    p_purchase_amount DECIMAL,
    p_transaction_id TEXT
)
RETURNS VOID AS $$
DECLARE
    v_founder_id UUID;
    v_referral_id UUID;
    v_commission_amount DECIMAL;
    v_commission_rate DECIMAL := 0.50;
BEGIN
    SELECT referred_by_founder_id INTO v_founder_id 
    FROM profiles 
    WHERE id = p_provider_id;
    
    IF v_founder_id IS NULL THEN
        RETURN;
    END IF;
    
    SELECT id INTO v_referral_id 
    FROM founder_referrals 
    WHERE founder_id = v_founder_id 
    AND provider_profile_id = p_provider_id 
    LIMIT 1;
    
    v_commission_amount := p_purchase_amount * v_commission_rate;
    
    INSERT INTO founder_commissions (
        founder_id,
        referral_id,
        commission_type,
        source_transaction_id,
        original_amount,
        commission_rate,
        commission_amount,
        description,
        status
    ) VALUES (
        v_founder_id,
        v_referral_id,
        'bid_pack',
        p_transaction_id,
        p_purchase_amount,
        v_commission_rate,
        v_commission_amount,
        'Commission from bid pack purchase',
        'pending'
    );
    
    UPDATE member_founder_profiles
    SET 
        total_commissions_earned = total_commissions_earned + v_commission_amount,
        pending_balance = pending_balance + v_commission_amount,
        updated_at = NOW()
    WHERE id = v_founder_id;
END;
$$ LANGUAGE plpgsql;

-- Example usage after a bid pack purchase:
-- SELECT record_bid_pack_commission('provider-uuid', 49.99, 'stripe_pi_xxx');

-- 10. Function to register a provider referral (callable by anyone, bypasses RLS)
-- This allows providers to register themselves as referred during signup
CREATE OR REPLACE FUNCTION register_provider_referral(
    p_referral_code TEXT,
    p_provider_user_id UUID,
    p_provider_email TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_founder member_founder_profiles%ROWTYPE;
    v_existing_referral founder_referrals%ROWTYPE;
    v_result JSONB;
BEGIN
    -- Look up the founder by referral code (case-insensitive)
    SELECT * INTO v_founder 
    FROM member_founder_profiles 
    WHERE UPPER(referral_code) = UPPER(p_referral_code)
    AND status = 'active'
    LIMIT 1;
    
    IF v_founder.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Referral code not found or inactive'
        );
    END IF;
    
    -- Check if this provider is already referred (check both user_id and profile_id)
    SELECT * INTO v_existing_referral
    FROM founder_referrals
    WHERE (referred_user_id = p_provider_user_id OR provider_profile_id = p_provider_user_id)
    AND referred_type = 'provider'
    LIMIT 1;
    
    IF v_existing_referral.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'already_referred',
            'existing_founder_id', v_existing_referral.founder_id
        );
    END IF;
    
    -- Update the provider's profile with referral info
    UPDATE profiles
    SET referred_by_code = UPPER(p_referral_code),
        referred_by_founder_id = v_founder.id
    WHERE id = p_provider_user_id;
    
    -- Insert the referral record
    INSERT INTO founder_referrals (
        founder_id,
        referral_code,
        referred_type,
        referred_user_id,
        referred_email,
        provider_profile_id,
        status
    ) VALUES (
        v_founder.id,
        UPPER(p_referral_code),
        'provider',
        p_provider_user_id,
        p_provider_email,
        p_provider_user_id,
        'active'
    );
    
    -- Increment the founder's provider referral count
    UPDATE member_founder_profiles
    SET total_provider_referrals = total_provider_referrals + 1,
        updated_at = NOW()
    WHERE id = v_founder.id;
    
    RETURN jsonb_build_object(
        'success', true,
        'founder_name', v_founder.full_name,
        'founder_id', v_founder.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION register_provider_referral TO authenticated;

-- 11. Function to register a member referral (callable by anyone, bypasses RLS)
-- This allows members to register themselves as referred during signup
CREATE OR REPLACE FUNCTION register_member_referral(
    p_referral_code TEXT,
    p_member_user_id UUID,
    p_member_email TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_founder member_founder_profiles%ROWTYPE;
    v_existing_referral founder_referrals%ROWTYPE;
    v_result JSONB;
BEGIN
    -- Look up the founder by referral code (case-insensitive)
    SELECT * INTO v_founder 
    FROM member_founder_profiles 
    WHERE UPPER(referral_code) = UPPER(p_referral_code)
    AND status = 'active'
    LIMIT 1;
    
    IF v_founder.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Referral code not found or inactive'
        );
    END IF;
    
    -- Check if this member is already referred
    SELECT * INTO v_existing_referral
    FROM founder_referrals
    WHERE referred_user_id = p_member_user_id
    AND referred_type = 'member'
    LIMIT 1;
    
    IF v_existing_referral.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'already_referred',
            'existing_founder_id', v_existing_referral.founder_id
        );
    END IF;
    
    -- Update the member's profile with referral info (critical for commission tracking)
    UPDATE profiles
    SET referred_by_code = UPPER(p_referral_code),
        referred_by_founder_id = v_founder.id
    WHERE id = p_member_user_id;
    
    -- Insert the referral record
    INSERT INTO founder_referrals (
        founder_id,
        referral_code,
        referred_type,
        referred_user_id,
        referred_email,
        status
    ) VALUES (
        v_founder.id,
        UPPER(p_referral_code),
        'member',
        p_member_user_id,
        p_member_email,
        'active'
    );
    
    -- Increment the founder's member referral count
    UPDATE member_founder_profiles
    SET total_member_referrals = total_member_referrals + 1,
        updated_at = NOW()
    WHERE id = v_founder.id;
    
    RETURN jsonb_build_object(
        'success', true,
        'founder_name', v_founder.full_name,
        'founder_id', v_founder.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION register_member_referral TO authenticated;

-- 12. Add unique constraint to prevent duplicate referrals
CREATE UNIQUE INDEX IF NOT EXISTS idx_founder_referrals_unique_provider 
ON founder_referrals(provider_profile_id) 
WHERE referred_type = 'provider' AND provider_profile_id IS NOT NULL;

-- Add unique constraint for member referrals as well
CREATE UNIQUE INDEX IF NOT EXISTS idx_founder_referrals_unique_member 
ON founder_referrals(referred_user_id) 
WHERE referred_type = 'member' AND referred_user_id IS NOT NULL;

-- 13. Function to calculate and record commission from platform fees (when referred members complete jobs)
-- This is called when a member's job is completed and payment is released
-- Commission rate: 5% of the platform fee (MCC fee is 7.5% of job total)
-- SECURITY: Validates auth.uid() matches member_id, fetches fee from database, checks for duplicates
CREATE OR REPLACE FUNCTION record_platform_fee_commission(
    p_member_id UUID,
    p_platform_fee DECIMAL,
    p_package_id UUID,
    p_transaction_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_founder_id UUID;
    v_referral_id UUID;
    v_commission_amount DECIMAL;
    v_commission_rate DECIMAL := 0.05; -- 5% of platform fee
    v_actual_platform_fee DECIMAL;
    v_package_owner UUID;
    v_existing_commission_id UUID;
BEGIN
    -- SECURITY: Verify the caller is the member (auth.uid() must match member_id)
    IF auth.uid() != p_member_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: caller must be the member'
        );
    END IF;
    
    -- SECURITY: Verify the package belongs to this member and get the actual platform fee from database
    SELECT mp.member_id, p.amount_mcc_fee 
    INTO v_package_owner, v_actual_platform_fee
    FROM maintenance_packages mp
    LEFT JOIN payments p ON p.package_id = mp.id
    WHERE mp.id = p_package_id
    LIMIT 1;
    
    IF v_package_owner IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Package not found'
        );
    END IF;
    
    IF v_package_owner != p_member_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: package does not belong to caller'
        );
    END IF;
    
    -- Use the database value for platform fee (ignore client-supplied value for security)
    IF v_actual_platform_fee IS NULL OR v_actual_platform_fee <= 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'commission_recorded', false,
            'reason', 'No platform fee found for this package'
        );
    END IF;
    
    -- IDEMPOTENCY: Check if commission already recorded for this package
    SELECT id INTO v_existing_commission_id
    FROM founder_commissions
    WHERE commission_type = 'platform_fee'
    AND source_transaction_id = p_package_id::TEXT
    LIMIT 1;
    
    IF v_existing_commission_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'commission_recorded', false,
            'reason', 'Commission already recorded for this package'
        );
    END IF;
    
    -- Look up if this member was referred by a founder
    SELECT referred_by_founder_id INTO v_founder_id 
    FROM profiles 
    WHERE id = p_member_id;
    
    -- If not referred, return success but no commission
    IF v_founder_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'commission_recorded', false,
            'reason', 'Member was not referred by a founder'
        );
    END IF;
    
    -- Find the referral record
    SELECT id INTO v_referral_id 
    FROM founder_referrals 
    WHERE founder_id = v_founder_id 
    AND referred_user_id = p_member_id 
    AND referred_type = 'member'
    LIMIT 1;
    
    -- Calculate commission using database value (5% of platform fee)
    v_commission_amount := v_actual_platform_fee * v_commission_rate;
    
    -- Don't create commission if amount is too small
    IF v_commission_amount < 0.01 THEN
        RETURN jsonb_build_object(
            'success', true,
            'commission_recorded', false,
            'reason', 'Commission amount too small'
        );
    END IF;
    
    -- Insert commission record
    INSERT INTO founder_commissions (
        founder_id,
        referral_id,
        commission_type,
        source_transaction_id,
        original_amount,
        commission_rate,
        commission_amount,
        description,
        status
    ) VALUES (
        v_founder_id,
        v_referral_id,
        'platform_fee',
        p_package_id::TEXT,
        v_actual_platform_fee,
        v_commission_rate,
        v_commission_amount,
        'Commission from referred member job completion (Package: ' || p_package_id::TEXT || ')',
        'pending'
    );
    
    -- Update founder's totals
    UPDATE member_founder_profiles
    SET 
        total_commissions_earned = total_commissions_earned + v_commission_amount,
        pending_balance = pending_balance + v_commission_amount,
        updated_at = NOW()
    WHERE id = v_founder_id;
    
    -- Update referral status to 'completed' if still 'active' (first completed job)
    UPDATE founder_referrals
    SET status = 'completed'
    WHERE id = v_referral_id AND status = 'active';
    
    RETURN jsonb_build_object(
        'success', true,
        'commission_recorded', true,
        'founder_id', v_founder_id,
        'commission_amount', v_commission_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION record_platform_fee_commission TO authenticated;

-- ==========================================
-- ADDITIONAL MIGRATIONS
-- ==========================================

-- Oil Preference for maintenance packages
-- This column stores member's oil/fluid preference as JSON
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS oil_preference JSONB DEFAULT NULL;

-- Stripe Connect columns for member founder profiles
-- Stores the Stripe Express connected account ID for automated payouts
ALTER TABLE member_founder_profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

-- Update payout_method to include stripe_connect option
-- Note: Run this only if constraint exists and needs updating
-- ALTER TABLE member_founder_profiles DROP CONSTRAINT IF EXISTS member_founder_profiles_payout_method_check;
-- ALTER TABLE member_founder_profiles ADD CONSTRAINT member_founder_profiles_payout_method_check 
--   CHECK (payout_method IN ('paypal', 'venmo', 'zelle', 'bank_transfer', 'check', 'stripe_connect'));

-- Stripe Transfer ID for founder payouts
-- Stores the Stripe transfer ID after successful payout processing
ALTER TABLE founder_payouts ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

-- Founder type to distinguish member founders from provider founders
-- 'member' = regular member who joined founder program
-- 'provider' = provider who refers other providers
ALTER TABLE member_founder_profiles ADD COLUMN IF NOT EXISTS founder_type TEXT DEFAULT 'member';

-- ==========================================
-- URGENT UPDATES SYSTEM
-- ==========================================
-- Expands the upsell_requests table to handle multiple types of provider-to-member alerts

-- Add update_type column to upsell_requests table
-- 'cost_increase' = Additional work/funds needed (existing upsell behavior)
-- 'car_ready' = Vehicle is ready for pickup
-- 'work_paused' = Work is paused pending member decision
-- 'question' = Provider has a question for the member
-- 'update' = General status update
ALTER TABLE upsell_requests ADD COLUMN IF NOT EXISTS update_type TEXT DEFAULT 'cost_increase';

-- Add requires_response column - whether member needs to take action
ALTER TABLE upsell_requests ADD COLUMN IF NOT EXISTS requires_response BOOLEAN DEFAULT true;

-- Add is_urgent column - for time-sensitive matters
ALTER TABLE upsell_requests ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;

-- Add member quick response options
ALTER TABLE upsell_requests ADD COLUMN IF NOT EXISTS member_action TEXT; -- 'approved', 'declined', 'call_me', 'acknowledged'

-- Add call_requested column - member wants provider to call them
ALTER TABLE upsell_requests ADD COLUMN IF NOT EXISTS call_requested BOOLEAN DEFAULT false;
ALTER TABLE upsell_requests ADD COLUMN IF NOT EXISTS call_completed BOOLEAN DEFAULT false;

-- Add member_response column - for free-text replies to questions
ALTER TABLE upsell_requests ADD COLUMN IF NOT EXISTS member_response TEXT;

-- Create index for faster urgent update lookups
CREATE INDEX IF NOT EXISTS idx_upsell_requests_urgent ON upsell_requests(member_id, status, is_urgent, update_type);
