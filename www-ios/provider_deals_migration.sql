-- ============================================
-- My Car Concierge - Provider Custom Deals
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS provider_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    bid_pack_discount_pct INTEGER DEFAULT 0 CHECK (bid_pack_discount_pct >= 0 AND bid_pack_discount_pct <= 100),
    referral_commission_pct INTEGER DEFAULT 50 CHECK (referral_commission_pct >= 0 AND referral_commission_pct <= 100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_deals_provider_id ON provider_deals(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_deals_updated ON provider_deals(updated_at DESC);

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
    v_custom_rate INTEGER;
BEGIN
    SELECT referred_by_founder_id INTO v_founder_id 
    FROM profiles 
    WHERE id = p_provider_id;
    
    IF v_founder_id IS NULL THEN
        RETURN;
    END IF;
    
    SELECT pd.referral_commission_pct INTO v_custom_rate
    FROM provider_deals pd
    JOIN profiles p ON p.id = pd.provider_id
    WHERE p.referred_by_founder_id IS NOT NULL
    AND pd.provider_id = (
        SELECT mfp.user_id FROM member_founder_profiles mfp WHERE mfp.id = v_founder_id
    );
    
    IF v_custom_rate IS NOT NULL THEN
        v_commission_rate := v_custom_rate::DECIMAL / 100;
    END IF;
    
    SELECT id INTO v_referral_id 
    FROM founder_referrals 
    WHERE founder_id = v_founder_id 
    AND provider_profile_id = p_provider_id 
    LIMIT 1;
    
    v_commission_amount := p_purchase_amount * v_commission_rate;
    
    INSERT INTO founder_commissions (
        founder_id, referral_id, commission_type, source_transaction_id,
        original_amount, commission_rate, commission_amount, description, status
    ) VALUES (
        v_founder_id, v_referral_id, 'bid_pack', p_transaction_id,
        p_purchase_amount, v_commission_rate, v_commission_amount,
        'Commission from bid pack purchase', 'pending'
    );
    
    UPDATE member_founder_profiles
    SET pending_balance = pending_balance + v_commission_amount,
        total_commissions_earned = total_commissions_earned + v_commission_amount,
        updated_at = NOW()
    WHERE id = v_founder_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_provider_deal(p_provider_id UUID)
RETURNS TABLE (
    bid_pack_discount_pct INTEGER,
    referral_commission_pct INTEGER,
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(pd.bid_pack_discount_pct, 0),
        COALESCE(pd.referral_commission_pct, 50),
        pd.notes,
        pd.updated_at
    FROM provider_deals pd
    WHERE pd.provider_id = p_provider_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 50, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_discounted_bid_pack_price(
    p_provider_id UUID,
    p_original_price DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    v_discount_pct INTEGER := 0;
BEGIN
    SELECT COALESCE(bid_pack_discount_pct, 0) INTO v_discount_pct
    FROM provider_deals
    WHERE provider_id = p_provider_id;
    
    IF v_discount_pct = 100 THEN
        RETURN 0;
    END IF;
    
    RETURN p_original_price * (1 - v_discount_pct::DECIMAL / 100);
END;
$$ LANGUAGE plpgsql;
