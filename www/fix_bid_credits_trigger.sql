-- FIX: bid_credits column does not exist on provider_stats table
-- The bid_credits column lives on the profiles table, not provider_stats.
-- This patch updates the two database functions that incorrectly reference it.
-- Run this in your Supabase Dashboard → SQL Editor

-- =====================================================
-- 1. FIX: check_provider_suspension function
-- Changed bid_credits references from provider_stats to profiles table
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
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
    IF v_caller_role != 'admin' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Only admins can manually trigger suspension checks'
      );
    END IF;
  END IF;
  
  SELECT EXISTS(SELECT 1 FROM provider_stats WHERE provider_id = p_provider_id) INTO v_stats_exists;
  IF NOT v_stats_exists THEN
    INSERT INTO provider_stats (provider_id, total_reviews, suspended)
    VALUES (p_provider_id, 0, FALSE);
  END IF;
  
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
  
  SELECT average_rating, total_reviews 
  INTO v_avg_rating, v_total_reviews
  FROM calculate_provider_rating(p_provider_id);
  
  IF v_total_reviews >= 3 AND v_avg_rating < 4.0 THEN
    SELECT COALESCE(bid_credits, 0) INTO v_current_credits
    FROM profiles
    WHERE id = p_provider_id;
    
    v_credit_value := 3.50;
    v_refund_amount := v_current_credits * v_credit_value;
    
    UPDATE provider_stats
    SET 
      suspended = TRUE,
      suspended_reason = 'Average rating dropped below 4.0 stars (' || v_avg_rating || ' with ' || v_total_reviews || ' reviews)',
      suspended_at = NOW()
    WHERE provider_id = p_provider_id;

    UPDATE profiles
    SET bid_credits = 0
    WHERE id = p_provider_id;
    
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
      'Your account has been suspended due to low ratings (' || v_avg_rating || ' stars). ' ||
      CASE WHEN v_current_credits > 0 
        THEN 'A refund of $' || v_refund_amount || ' for your ' || v_current_credits || ' bid credits has been initiated.'
        ELSE 'Please contact support for reinstatement options.'
      END,
      '/provider-dashboard.html?tab=ratings'
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'suspended',
      'reason', 'Rating below 4.0 with 3+ reviews',
      'rating', v_avg_rating,
      'reviews', v_total_reviews,
      'credits_refunded', v_current_credits,
      'refund_amount', v_refund_amount
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'action', 'none',
    'reason', 'Provider meets rating requirements',
    'rating', v_avg_rating,
    'reviews', v_total_reviews
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2. FIX: can_provider_bid function
-- Changed bid_credits reference from provider_stats to profiles table
-- =====================================================
CREATE OR REPLACE FUNCTION can_provider_bid(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_suspended BOOLEAN;
  v_credits INTEGER;
  v_approved BOOLEAN;
BEGIN
  SELECT 
    COALESCE(ps.suspended, false),
    COALESCE(p.bid_credits, 0),
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
