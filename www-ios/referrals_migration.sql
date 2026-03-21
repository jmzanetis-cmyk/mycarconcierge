-- Referrals Table Migration for My Car Concierge
-- Run this migration to enable the referral program

-- Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    referral_code VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'credited')),
    credit_amount INTEGER DEFAULT 1000,
    referrer_credit_amount INTEGER DEFAULT 1000,
    referred_credit_amount INTEGER DEFAULT 1000,
    credited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create member_credits table to track referral credits
CREATE TABLE IF NOT EXISTS member_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_member_credits_member_id ON member_credits(member_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_referrals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_referrals_updated_at ON referrals;
CREATE TRIGGER trigger_referrals_updated_at
    BEFORE UPDATE ON referrals
    FOR EACH ROW
    EXECUTE FUNCTION update_referrals_updated_at();

-- Enable Row Level Security
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_credits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referrals table
DROP POLICY IF EXISTS "Users can view their own referrals as referrer" ON referrals;
CREATE POLICY "Users can view their own referrals as referrer"
    ON referrals FOR SELECT
    USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "Users can view referrals where they are referred" ON referrals;
CREATE POLICY "Users can view referrals where they are referred"
    ON referrals FOR SELECT
    USING (auth.uid() = referred_id);

DROP POLICY IF EXISTS "Users can insert their own referral codes" ON referrals;
CREATE POLICY "Users can insert their own referral codes"
    ON referrals FOR INSERT
    WITH CHECK (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "Service role can do everything on referrals" ON referrals;
CREATE POLICY "Service role can do everything on referrals"
    ON referrals FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for member_credits table
DROP POLICY IF EXISTS "Users can view their own credits" ON member_credits;
CREATE POLICY "Users can view their own credits"
    ON member_credits FOR SELECT
    USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "Service role can do everything on member_credits" ON member_credits;
CREATE POLICY "Service role can do everything on member_credits"
    ON member_credits FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON referrals TO authenticated;
GRANT SELECT ON member_credits TO authenticated;
GRANT ALL ON referrals TO service_role;
GRANT ALL ON member_credits TO service_role;
