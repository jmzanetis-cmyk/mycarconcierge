-- =====================================================
-- MY CAR CONCIERGE - PROVIDER RATING & SUSPENSION SYSTEM
-- Run this script in Supabase SQL Editor after main setup
-- =====================================================

-- =====================================================
-- 1. ADD SUSPENSION COLUMNS TO PROVIDER_STATS
-- =====================================================
DO $$
BEGIN
  -- Add suspended column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_stats' AND column_name = 'suspended'
  ) THEN
    ALTER TABLE provider_stats ADD COLUMN suspended BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add suspended_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_stats' AND column_name = 'suspended_reason'
  ) THEN
    ALTER TABLE provider_stats ADD COLUMN suspended_reason TEXT;
  END IF;
  
  -- Add suspended_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_stats' AND column_name = 'suspended_at'
  ) THEN
    ALTER TABLE provider_stats ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  
  -- Add suspension_lifted_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_stats' AND column_name = 'suspension_lifted_at'
  ) THEN
    ALTER TABLE provider_stats ADD COLUMN suspension_lifted_at TIMESTAMPTZ;
  END IF;
  
  -- Add suspension_lifted_by (admin who lifted)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_stats' AND column_name = 'suspension_lifted_by'
  ) THEN
    ALTER TABLE provider_stats ADD COLUMN suspension_lifted_by UUID REFERENCES profiles(id);
  END IF;
END $$;

-- =====================================================
-- 2. CREDIT REFUNDS TABLE
-- Tracks refunds given to suspended providers
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Refund details
  credits_refunded INTEGER NOT NULL,
  dollar_amount DECIMAL(10, 2) NOT NULL,
  refund_reason TEXT NOT NULL,
  
  -- Original purchase reference (if applicable)
  original_purchase_id UUID,
  
  -- Stripe refund tracking
  stripe_refund_id TEXT,
  stripe_payment_intent_id TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Notes
  admin_notes TEXT
);

-- Enable RLS
ALTER TABLE credit_refunds ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Providers can view their own refunds" ON credit_refunds
  FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Admins can manage all refunds" ON credit_refunds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_refunds_provider ON credit_refunds(provider_id);
CREATE INDEX IF NOT EXISTS idx_credit_refunds_status ON credit_refunds(status);

-- =====================================================
-- 3. CALCULATE PROVIDER RATING FUNCTION
-- Returns the average rating for a provider
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_provider_rating(p_provider_id UUID)
RETURNS TABLE (
  average_rating DECIMAL,
  total_reviews INTEGER,
  rating_1_count INTEGER,
  rating_2_count INTEGER,
  rating_3_count INTEGER,
  rating_4_count INTEGER,
  rating_5_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(AVG(pr.rating)::DECIMAL(3,2), 0) as average_rating,
    COUNT(*)::INTEGER as total_reviews,
    COUNT(*) FILTER (WHERE pr.rating = 1)::INTEGER as rating_1_count,
    COUNT(*) FILTER (WHERE pr.rating = 2)::INTEGER as rating_2_count,
    COUNT(*) FILTER (WHERE pr.rating = 3)::INTEGER as rating_3_count,
    COUNT(*) FILTER (WHERE pr.rating = 4)::INTEGER as rating_4_count,
    COUNT(*) FILTER (WHERE pr.rating = 5)::INTEGER as rating_5_count
  FROM provider_reviews pr
  WHERE pr.provider_id = p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. CHECK AND APPLY PROVIDER SUSPENSION (Internal use)
-- Automatically suspends provider if rating drops below 4.0
-- with at least 3 reviews, and refunds their bid credits
-- NOTE: This is called by trigger or admin only
-- =====================================================
CREATE OR REPLACE FUNCTION check_provider_suspension(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_avg_rating DECIMAL;
  v_total_reviews INTEGER;
  v_current_credits INTEGER;
  v_credit_value DECIMAL;
  v_refund_amount DECIMAL;
  v_already_suspended BOOLEAN;
  v_refund_id UUID;
  v_caller_role TEXT;
  v_stats_exists BOOLEAN;
BEGIN
  -- SECURITY: Only allow admins or internal trigger calls (auth.uid() is null in trigger context)
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
    IF v_caller_role != 'admin' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Only admins can manually trigger suspension checks'
      );
    END IF;
  END IF;
  
  -- Ensure provider_stats row exists
  SELECT EXISTS(SELECT 1 FROM provider_stats WHERE provider_id = p_provider_id) INTO v_stats_exists;
  IF NOT v_stats_exists THEN
    INSERT INTO provider_stats (provider_id, bid_credits, total_reviews, suspended)
    VALUES (p_provider_id, 0, 0, FALSE);
  END IF;
  
  -- Check if already suspended
  SELECT suspended INTO v_already_suspended
  FROM provider_stats
  WHERE provider_id = p_provider_id;
  
  IF v_already_suspended = TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'none',
      'reason', 'Provider already suspended'
    );
  END IF;
  
  -- Get rating stats
  SELECT average_rating, total_reviews 
  INTO v_avg_rating, v_total_reviews
  FROM calculate_provider_rating(p_provider_id);
  
  -- Check suspension criteria: <4.0 average with 3+ reviews
  IF v_total_reviews >= 3 AND v_avg_rating < 4.0 THEN
    -- Get current bid credits
    SELECT COALESCE(bid_credits, 0) INTO v_current_credits
    FROM provider_stats
    WHERE provider_id = p_provider_id;
    
    -- Calculate refund amount (average bid cost ~$3.50)
    v_credit_value := 3.50;
    v_refund_amount := v_current_credits * v_credit_value;
    
    -- Suspend the provider
    UPDATE provider_stats
    SET 
      suspended = TRUE,
      suspended_reason = 'Average rating dropped below 4.0 stars (' || v_avg_rating || ' with ' || v_total_reviews || ' reviews)',
      suspended_at = NOW(),
      bid_credits = 0  -- Zero out credits (they will be refunded)
    WHERE provider_id = p_provider_id;
    
    -- Create refund record if they had credits
    IF v_current_credits > 0 THEN
      INSERT INTO credit_refunds (
        provider_id,
        credits_refunded,
        dollar_amount,
        refund_reason,
        status
      ) VALUES (
        p_provider_id,
        v_current_credits,
        v_refund_amount,
        'Automatic refund due to suspension (rating: ' || v_avg_rating || ')',
        'pending'
      ) RETURNING id INTO v_refund_id;
    END IF;
    
    -- Create notification for provider
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link
    ) VALUES (
      p_provider_id,
      'suspension',
      'Account Suspended',
      'Your account has been suspended due to a rating below 4.0 stars. Your ' || v_current_credits || ' bid credits ($' || v_refund_amount || ') will be refunded.',
      '/providers.html'
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'suspended',
      'average_rating', v_avg_rating,
      'total_reviews', v_total_reviews,
      'credits_refunded', v_current_credits,
      'refund_amount', v_refund_amount,
      'refund_id', v_refund_id
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'action', 'none',
    'average_rating', v_avg_rating,
    'total_reviews', v_total_reviews,
    'reason', 'Rating criteria not met for suspension'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. IS PROVIDER SUSPENDED FUNCTION
-- Quick check if a provider is suspended
-- =====================================================
CREATE OR REPLACE FUNCTION is_provider_suspended(p_provider_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_suspended BOOLEAN;
BEGIN
  SELECT COALESCE(suspended, FALSE) INTO v_suspended
  FROM provider_stats
  WHERE provider_id = p_provider_id;
  
  RETURN COALESCE(v_suspended, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. LIFT PROVIDER SUSPENSION (Admin only)
-- Uses auth.uid() to verify caller is admin
-- =====================================================
CREATE OR REPLACE FUNCTION lift_provider_suspension(
  p_provider_id UUID,
  p_reason TEXT DEFAULT 'Suspension lifted by admin'
)
RETURNS JSONB AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_was_suspended BOOLEAN;
  v_admin_id UUID;
BEGIN
  -- Get the actual caller's ID
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Verify caller is admin using their actual auth ID
  SELECT (role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = v_admin_id;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only admins can lift suspensions'
    );
  END IF;
  
  -- Check if provider is suspended
  SELECT suspended INTO v_was_suspended
  FROM provider_stats
  WHERE provider_id = p_provider_id;
  
  IF NOT v_was_suspended THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Provider is not currently suspended'
    );
  END IF;
  
  -- Lift the suspension
  UPDATE provider_stats
  SET 
    suspended = FALSE,
    suspended_reason = suspended_reason || ' | LIFTED: ' || p_reason,
    suspension_lifted_at = NOW(),
    suspension_lifted_by = v_admin_id
  WHERE provider_id = p_provider_id;
  
  -- Notify provider
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    link
  ) VALUES (
    p_provider_id,
    'suspension_lifted',
    'Account Reinstated',
    'Your account suspension has been lifted. You can now bid on jobs again.',
    '/providers.html'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Suspension lifted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 7. GET PROVIDER REVIEWS SUMMARY
-- Returns detailed review statistics
-- =====================================================
CREATE OR REPLACE FUNCTION get_provider_reviews_summary(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_avg_rating DECIMAL;
  v_total_reviews INTEGER;
  v_suspended BOOLEAN;
  v_suspended_at TIMESTAMPTZ;
  v_suspended_reason TEXT;
BEGIN
  -- Get rating stats
  SELECT average_rating, total_reviews 
  INTO v_avg_rating, v_total_reviews
  FROM calculate_provider_rating(p_provider_id);
  
  -- Get suspension status
  SELECT suspended, suspended_at, suspended_reason
  INTO v_suspended, v_suspended_at, v_suspended_reason
  FROM provider_stats
  WHERE provider_id = p_provider_id;
  
  -- Build result
  SELECT jsonb_build_object(
    'provider_id', p_provider_id,
    'average_rating', COALESCE(v_avg_rating, 0),
    'total_reviews', COALESCE(v_total_reviews, 0),
    'is_suspended', COALESCE(v_suspended, false),
    'suspended_at', v_suspended_at,
    'suspended_reason', v_suspended_reason,
    'at_risk', (v_total_reviews >= 2 AND v_avg_rating < 4.0 AND v_avg_rating >= 3.5),
    'recent_reviews', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT 
          pr.id,
          pr.rating,
          pr.review_text,
          pr.created_at,
          p.full_name as reviewer_name
        FROM provider_reviews pr
        JOIN profiles p ON p.id = pr.member_id
        WHERE pr.provider_id = p_provider_id
        ORDER BY pr.created_at DESC
        LIMIT 5
      ) r
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 8. CAN PROVIDER BID FUNCTION
-- Returns whether provider can place bids
-- =====================================================
CREATE OR REPLACE FUNCTION can_provider_bid(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_suspended BOOLEAN;
  v_credits INTEGER;
  v_approved BOOLEAN;
BEGIN
  -- Get provider status
  SELECT 
    COALESCE(ps.suspended, false),
    COALESCE(ps.bid_credits, 0),
    (p.role = 'provider')
  INTO v_suspended, v_credits, v_approved
  FROM profiles p
  LEFT JOIN provider_stats ps ON ps.provider_id = p.id
  WHERE p.id = p_provider_id;
  
  IF v_suspended THEN
    RETURN jsonb_build_object(
      'can_bid', false,
      'reason', 'Account is suspended due to low ratings'
    );
  END IF;
  
  IF NOT v_approved THEN
    RETURN jsonb_build_object(
      'can_bid', false,
      'reason', 'Account is not approved as a provider'
    );
  END IF;
  
  IF v_credits <= 0 THEN
    RETURN jsonb_build_object(
      'can_bid', false,
      'reason', 'No bid credits available'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'can_bid', true,
    'credits_available', v_credits
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 9. SUBMIT PROVIDER REVIEW
-- Adds a review and triggers suspension check
-- =====================================================
CREATE OR REPLACE FUNCTION submit_provider_review(
  p_provider_id UUID,
  p_member_id UUID,
  p_package_id UUID,
  p_rating INTEGER,
  p_review_text TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_review_id UUID;
  v_suspension_result JSONB;
BEGIN
  -- Validate rating
  IF p_rating < 1 OR p_rating > 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rating must be between 1 and 5'
    );
  END IF;
  
  -- Check if review already exists for this package
  IF EXISTS (
    SELECT 1 FROM provider_reviews 
    WHERE package_id = p_package_id 
    AND member_id = p_member_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You have already reviewed this service'
    );
  END IF;
  
  -- Insert the review
  INSERT INTO provider_reviews (
    provider_id,
    member_id,
    package_id,
    rating,
    review_text
  ) VALUES (
    p_provider_id,
    p_member_id,
    p_package_id,
    p_rating,
    p_review_text
  ) RETURNING id INTO v_review_id;
  
  -- Update provider stats
  UPDATE provider_stats
  SET 
    total_reviews = COALESCE(total_reviews, 0) + 1,
    updated_at = NOW()
  WHERE provider_id = p_provider_id;
  
  -- Check for suspension (if rating is low)
  IF p_rating <= 3 THEN
    v_suspension_result := check_provider_suspension(p_provider_id);
  ELSE
    v_suspension_result := jsonb_build_object('action', 'none');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'suspension_check', v_suspension_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 10. TRIGGER: AUTO-CHECK SUSPENSION AFTER REVIEW
-- Runs after every review insert
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_check_suspension_after_review()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check if rating is 3 or below
  IF NEW.rating <= 3 THEN
    PERFORM check_provider_suspension(NEW.provider_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS check_suspension_after_review ON provider_reviews;

-- Create trigger
CREATE TRIGGER check_suspension_after_review
  AFTER INSERT ON provider_reviews
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_suspension_after_review();

-- =====================================================
-- 11. GET PROVIDER CREDIT REFUNDS
-- Returns refund history for a provider
-- =====================================================
CREATE OR REPLACE FUNCTION get_provider_credit_refunds(p_provider_id UUID)
RETURNS TABLE (
  id UUID,
  credits_refunded INTEGER,
  dollar_amount DECIMAL,
  refund_reason TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.id,
    cr.credits_refunded,
    cr.dollar_amount,
    cr.refund_reason,
    cr.status,
    cr.created_at,
    cr.processed_at
  FROM credit_refunds cr
  WHERE cr.provider_id = p_provider_id
  ORDER BY cr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT EXECUTE ON FUNCTION calculate_provider_rating TO authenticated;
GRANT EXECUTE ON FUNCTION check_provider_suspension TO authenticated;
GRANT EXECUTE ON FUNCTION is_provider_suspended TO authenticated;
GRANT EXECUTE ON FUNCTION lift_provider_suspension TO authenticated;
GRANT EXECUTE ON FUNCTION get_provider_reviews_summary TO authenticated;
GRANT EXECUTE ON FUNCTION can_provider_bid TO authenticated;
GRANT EXECUTE ON FUNCTION submit_provider_review TO authenticated;
GRANT EXECUTE ON FUNCTION get_provider_credit_refunds TO authenticated;

-- =====================================================
-- SUMMARY
-- =====================================================
-- This migration adds:
-- 
-- 1. Suspension columns to provider_stats:
--    - suspended (boolean)
--    - suspended_reason (text)
--    - suspended_at (timestamp)
--    - suspension_lifted_at (timestamp)
--    - suspension_lifted_by (uuid)
--
-- 2. credit_refunds table for tracking refunds
--
-- 3. Functions:
--    - calculate_provider_rating(provider_id)
--    - check_provider_suspension(provider_id) 
--    - is_provider_suspended(provider_id)
--    - lift_provider_suspension(provider_id, admin_id)
--    - get_provider_reviews_summary(provider_id)
--    - can_provider_bid(provider_id)
--    - submit_provider_review(...)
--    - get_provider_credit_refunds(provider_id)
--
-- 4. Trigger: check_suspension_after_review
--    - Auto-checks suspension after each review
--
-- SUSPENSION RULES:
-- - Triggers when: avg rating < 4.0 AND total reviews >= 3
-- - When suspended:
--   * Provider cannot bid on new jobs
--   * All bid credits are zeroed and refunded
--   * Provider receives notification
-- - Admin can lift suspension via lift_provider_suspension()
-- =====================================================
