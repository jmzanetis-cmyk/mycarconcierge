-- Provider Loyalty Referral System Migration
-- Enables providers to refer their loyal customers and other providers

-- Add provider referral tracking fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by_provider_id UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS provider_referral_type TEXT CHECK (provider_referral_type IN ('loyal_customer', 'new_member', 'provider'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS platform_fee_exempt BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS provider_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS provider_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_provider_id UUID REFERENCES profiles(id);

-- Create index for provider referrals
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by_provider ON profiles(referred_by_provider_id);
CREATE INDEX IF NOT EXISTS idx_profiles_platform_fee_exempt ON profiles(platform_fee_exempt);
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_provider ON profiles(preferred_provider_id);

-- Provider referral codes table (separate from founder referrals)
CREATE TABLE IF NOT EXISTS provider_referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    code_type TEXT NOT NULL CHECK (code_type IN ('loyal_customer', 'new_member', 'provider')),
    code VARCHAR(20) UNIQUE NOT NULL,
    uses_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint for one code per type per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_referral_codes_unique ON provider_referral_codes(provider_id, code_type);

-- Provider referral tracking table
CREATE TABLE IF NOT EXISTS provider_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_type TEXT NOT NULL CHECK (referral_type IN ('loyal_customer', 'new_member', 'provider')),
    referral_code VARCHAR(20) NOT NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
    platform_fee_exempt BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for provider referrals
CREATE INDEX IF NOT EXISTS idx_provider_referrals_provider_id ON provider_referrals(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_referrals_referred_user_id ON provider_referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_provider_referrals_referral_type ON provider_referrals(referral_type);

-- Add exclusive bidding window fields to maintenance_packages
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS exclusive_provider_id UUID REFERENCES profiles(id);
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS exclusive_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS is_private_job BOOLEAN DEFAULT false;

-- Create index for exclusive bidding
CREATE INDEX IF NOT EXISTS idx_packages_exclusive_provider ON maintenance_packages(exclusive_provider_id);
CREATE INDEX IF NOT EXISTS idx_packages_exclusive_until ON maintenance_packages(exclusive_until);
CREATE INDEX IF NOT EXISTS idx_packages_private_job ON maintenance_packages(is_private_job);

-- Enable RLS on new table
ALTER TABLE provider_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for provider_referral_codes
DROP POLICY IF EXISTS "Providers can view their own referral codes" ON provider_referral_codes;
CREATE POLICY "Providers can view their own referral codes"
    ON provider_referral_codes FOR SELECT
    USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Providers can insert their own referral codes" ON provider_referral_codes;
CREATE POLICY "Providers can insert their own referral codes"
    ON provider_referral_codes FOR INSERT
    WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Providers can update their own referral codes" ON provider_referral_codes;
CREATE POLICY "Providers can update their own referral codes"
    ON provider_referral_codes FOR UPDATE
    USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Anyone can lookup referral codes for signup" ON provider_referral_codes;
CREATE POLICY "Anyone can lookup referral codes for signup"
    ON provider_referral_codes FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Service role can do everything on provider_referral_codes" ON provider_referral_codes;
CREATE POLICY "Service role can do everything on provider_referral_codes"
    ON provider_referral_codes FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for provider_referrals
DROP POLICY IF EXISTS "Providers can view their own referrals" ON provider_referrals;
CREATE POLICY "Providers can view their own referrals"
    ON provider_referrals FOR SELECT
    USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Users can view their own referral record" ON provider_referrals;
CREATE POLICY "Users can view their own referral record"
    ON provider_referrals FOR SELECT
    USING (auth.uid() = referred_user_id);

DROP POLICY IF EXISTS "Service role can do everything on provider_referrals" ON provider_referrals;
CREATE POLICY "Service role can do everything on provider_referrals"
    ON provider_referrals FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_provider_referral_code(p_provider_id UUID, p_code_type TEXT)
RETURNS TEXT AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
    v_prefix TEXT;
BEGIN
    -- Set prefix based on code type
    CASE p_code_type
        WHEN 'loyal_customer' THEN v_prefix := 'LC';
        WHEN 'new_member' THEN v_prefix := 'NM';
        WHEN 'provider' THEN v_prefix := 'PR';
        ELSE v_prefix := 'RF';
    END CASE;
    
    LOOP
        -- Generate code: PREFIX + 6 random alphanumeric chars
        v_code := v_prefix || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        
        -- Check if code exists
        SELECT EXISTS(SELECT 1 FROM provider_referral_codes WHERE code = v_code) INTO v_exists;
        
        EXIT WHEN NOT v_exists;
    END LOOP;
    
    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to create all three referral codes for a provider
CREATE OR REPLACE FUNCTION create_provider_referral_codes(p_provider_id UUID)
RETURNS VOID AS $$
DECLARE
    v_code_types TEXT[] := ARRAY['loyal_customer', 'new_member', 'provider'];
    v_code_type TEXT;
    v_code TEXT;
BEGIN
    FOREACH v_code_type IN ARRAY v_code_types
    LOOP
        -- Check if code already exists
        IF NOT EXISTS(SELECT 1 FROM provider_referral_codes WHERE provider_id = p_provider_id AND code_type = v_code_type) THEN
            v_code := generate_provider_referral_code(p_provider_id, v_code_type);
            
            INSERT INTO provider_referral_codes (provider_id, code_type, code)
            VALUES (p_provider_id, v_code_type, v_code);
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to process provider referral during signup
CREATE OR REPLACE FUNCTION process_provider_referral(
    p_new_user_id UUID,
    p_referral_code TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_code_record RECORD;
    v_result JSONB;
BEGIN
    -- Look up the referral code
    SELECT prc.*, p.business_name, p.full_name
    INTO v_code_record
    FROM provider_referral_codes prc
    JOIN profiles p ON p.id = prc.provider_id
    WHERE prc.code = UPPER(p_referral_code)
    AND prc.is_active = true;
    
    IF v_code_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
    END IF;
    
    -- Update the new user's profile
    UPDATE profiles
    SET 
        referred_by_provider_id = v_code_record.provider_id,
        provider_referral_type = v_code_record.code_type,
        platform_fee_exempt = (v_code_record.code_type = 'loyal_customer'),
        provider_verified = (v_code_record.code_type = 'loyal_customer'),
        provider_verified_at = CASE WHEN v_code_record.code_type = 'loyal_customer' THEN NOW() ELSE NULL END,
        preferred_provider_id = CASE WHEN v_code_record.code_type = 'loyal_customer' THEN v_code_record.provider_id ELSE NULL END
    WHERE id = p_new_user_id;
    
    -- Create referral record
    INSERT INTO provider_referrals (provider_id, referred_user_id, referral_type, referral_code, platform_fee_exempt)
    VALUES (v_code_record.provider_id, p_new_user_id, v_code_record.code_type, v_code_record.code, v_code_record.code_type = 'loyal_customer');
    
    -- Increment uses count
    UPDATE provider_referral_codes
    SET uses_count = uses_count + 1, updated_at = NOW()
    WHERE id = v_code_record.id;
    
    RETURN jsonb_build_object(
        'success', true,
        'referral_type', v_code_record.code_type,
        'provider_name', COALESCE(v_code_record.business_name, v_code_record.full_name),
        'platform_fee_exempt', v_code_record.code_type = 'loyal_customer',
        'skip_identity_verification', v_code_record.code_type = 'loyal_customer'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a member should have exclusive bidding for their preferred provider
CREATE OR REPLACE FUNCTION set_exclusive_bidding_window(p_package_id UUID)
RETURNS VOID AS $$
DECLARE
    v_member_id UUID;
    v_preferred_provider_id UUID;
BEGIN
    -- Get the package owner and their preferred provider
    SELECT mp.member_id, p.preferred_provider_id
    INTO v_member_id, v_preferred_provider_id
    FROM maintenance_packages mp
    JOIN profiles p ON p.id = mp.member_id
    WHERE mp.id = p_package_id;
    
    -- If member has a preferred provider (loyal customer), set exclusive window
    IF v_preferred_provider_id IS NOT NULL THEN
        UPDATE maintenance_packages
        SET 
            exclusive_provider_id = v_preferred_provider_id,
            exclusive_until = NOW() + INTERVAL '24 hours'
        WHERE id = p_package_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON provider_referral_codes TO authenticated;
GRANT SELECT ON provider_referrals TO authenticated;
GRANT ALL ON provider_referral_codes TO service_role;
GRANT ALL ON provider_referrals TO service_role;
GRANT EXECUTE ON FUNCTION generate_provider_referral_code TO authenticated;
GRANT EXECUTE ON FUNCTION create_provider_referral_codes TO authenticated;
GRANT EXECUTE ON FUNCTION process_provider_referral TO authenticated;
GRANT EXECUTE ON FUNCTION set_exclusive_bidding_window TO service_role;
