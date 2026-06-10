-- Add credit tracking columns to care_plans
ALTER TABLE care_plans
  ADD COLUMN IF NOT EXISTS credit_applied_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_redemption_id UUID REFERENCES member_credits(id);

-- SECURITY DEFINER RPC: atomically deduct credits and record on care plan.
-- Idempotent: if care_plan already has a redemption_id, returns existing values.
-- Guards: positive amount, sufficient balance, amount <= charge total.
CREATE OR REPLACE FUNCTION redeem_credits_for_payment(
  p_member_id     UUID,
  p_care_plan_id  UUID,
  p_credits_cents INT
)
RETURNS TABLE(credit_applied_cents INT, redemption_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance          INT;
  v_plan_credit      INT;
  v_plan_redemption  UUID;
  v_escrow_amount    NUMERIC;
  v_new_credit_id    UUID;
BEGIN
  -- Row-lock the care plan to prevent concurrent double-spend
  SELECT cp.credit_applied_cents, cp.credit_redemption_id, cp.escrow_amount
    INTO v_plan_credit, v_plan_redemption, v_escrow_amount
    FROM care_plans cp
   WHERE cp.id = p_care_plan_id AND cp.member_id = p_member_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'care plan not found or access denied';
  END IF;

  -- Idempotency: already redeemed -- return existing values
  IF v_plan_redemption IS NOT NULL THEN
    RETURN QUERY SELECT v_plan_credit, v_plan_redemption;
    RETURN;
  END IF;

  IF p_credits_cents <= 0 THEN
    RAISE EXCEPTION 'credits_cents must be positive';
  END IF;

  -- Compute live balance (negative rows already reduce it)
  SELECT COALESCE(SUM(amount), 0)
    INTO v_balance
    FROM member_credits
   WHERE member_id = p_member_id;

  IF v_balance < p_credits_cents THEN
    RAISE EXCEPTION 'insufficient credit balance';
  END IF;

  -- Cannot apply more than the charge total
  IF p_credits_cents > ROUND(v_escrow_amount * 100) THEN
    RAISE EXCEPTION 'credits exceed charge amount';
  END IF;

  -- Insert negative ledger row
  INSERT INTO member_credits(member_id, amount, type, description)
  VALUES (p_member_id, -p_credits_cents, 'redemption',
          'Applied to care plan ' || p_care_plan_id)
  RETURNING id INTO v_new_credit_id;

  -- Stamp the care plan
  UPDATE care_plans
     SET credit_applied_cents = p_credits_cents,
         credit_redemption_id = v_new_credit_id,
         updated_at = NOW()
   WHERE id = p_care_plan_id;

  RETURN QUERY SELECT p_credits_cents, v_new_credit_id;
END;
$$;

-- Grant execute to service role only (netlify functions use service role key)
REVOKE EXECUTE ON FUNCTION redeem_credits_for_payment(UUID, UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION redeem_credits_for_payment(UUID, UUID, INT) TO service_role;
