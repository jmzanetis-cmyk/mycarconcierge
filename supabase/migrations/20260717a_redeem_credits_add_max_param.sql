-- ============================================================================
-- 20260717a — redeem_credits_for_payment: add p_max_credit_cents parameter.
--
-- Phase 1 audit Finding #2 (MEDIUM-HIGH latent) — the RPC's existing cap
-- check compared p_credits_cents against care_plans.escrow_amount. But
-- handleAccept in care-plans.js calls this RPC BEFORE setting escrow_amount
-- on the plan row. At RPC call time, v_escrow_amount is NULL.
--
-- Postgres NULL comparison semantics: `p_credits_cents > NULL` evaluates
-- to NULL (not true, not false), so `IF ... THEN RAISE` never fires. The
-- guard has been INERT since the RPC shipped in 20260604e — every credit
-- request passed the cap regardless of amount.
--
-- Fix: require the caller to pass the bid amount as p_max_credit_cents.
-- The caller already has this value (handleAccept computes bidAmountCents
-- from bid.amount). Explicit NULL rejection prevents accidental omission
-- from re-introducing the inert-check bug.
--
-- The pre-existing escrow_amount check is preserved as belt+suspenders
-- for the case where the RPC is called after escrow_amount has been set
-- by some future call path — but only fires when escrow_amount IS NOT NULL,
-- to prevent the NULL-comparison silent-pass from returning.
--
-- Signature change: (uuid, uuid, int) → (uuid, uuid, int, int). The DROP
-- statement uses the OLD signature; the CREATE uses the NEW.
--
-- Cross-reference: handleAccept sequence audit CLOSED 2026-07-17 — this
-- was the only RPC affected by the call-order antipattern; wallet_spend
-- (the other RPC in handleAccept) doesn't depend on plan fields set later.
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.redeem_credits_for_payment(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.redeem_credits_for_payment(
  p_member_id        uuid,
  p_care_plan_id     uuid,
  p_credits_cents    integer,
  p_max_credit_cents integer
)
RETURNS TABLE(credit_applied_cents integer, redemption_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_credit     INT;
  v_plan_redemption UUID;
  v_escrow_amount   NUMERIC;
  v_new_credit_id   UUID;
  v_wallet_id       uuid;
  v_cash_balance    INT;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')
       ::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;

  -- PRIMARY CAP CHECK (Finding #2 fix). Required parameter — reject NULL
  -- explicitly so accidental omission by a future caller doesn't re-create
  -- the inert-check bug via NULL comparison silently passing.
  IF p_max_credit_cents IS NULL THEN
    RAISE EXCEPTION 'p_max_credit_cents is required (call site must supply bid amount in cents)';
  END IF;
  IF p_credits_cents > p_max_credit_cents THEN
    RAISE EXCEPTION 'Credits requested exceed bid amount cap (% > %)', p_credits_cents, p_max_credit_cents;
  END IF;

  SELECT cp.credit_applied_cents, cp.credit_redemption_id, cp.escrow_amount
    INTO v_plan_credit, v_plan_redemption, v_escrow_amount
    FROM care_plans cp
   WHERE cp.id = p_care_plan_id AND cp.member_id = p_member_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'care plan not found or access denied';
  END IF;

  IF v_plan_redemption IS NOT NULL THEN
    RETURN QUERY SELECT v_plan_credit, v_plan_redemption;
    RETURN;
  END IF;

  IF p_credits_cents <= 0 THEN
    RAISE EXCEPTION 'credits_cents must be positive';
  END IF;

  SELECT id, cash_balance_cents
    INTO v_wallet_id, v_cash_balance
    FROM public.wallet_accounts
   WHERE owner_id = p_member_id AND owner_type = 'member'
     FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_cash_balance
      FROM public.member_credits WHERE member_id = p_member_id;
    v_wallet_id := NULL;
  END IF;

  IF v_cash_balance < p_credits_cents THEN
    RAISE EXCEPTION 'insufficient credit balance';
  END IF;

  -- SECONDARY CAP CHECK (belt+suspenders). Only fires when escrow_amount
  -- IS NOT NULL — prevents the pre-fix NULL-comparison silent-pass from
  -- returning. Kept for the case where the RPC is called after
  -- escrow_amount has been set by some future call path.
  IF v_escrow_amount IS NOT NULL AND p_credits_cents > ROUND(v_escrow_amount * 100) THEN
    RAISE EXCEPTION 'credits exceed charge amount';
  END IF;

  INSERT INTO public.member_credits(member_id, amount, type, description)
  VALUES (p_member_id, -p_credits_cents, 'redemption',
          'Applied to care plan ' || p_care_plan_id)
  RETURNING id INTO v_new_credit_id;

  IF v_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents, ref_id, description
    ) VALUES (
      v_wallet_id, 'spend_cash', -p_credits_cents,
      v_cash_balance - p_credits_cents,
      p_care_plan_id::text,
      'Applied to care plan ' || p_care_plan_id
    );

    UPDATE public.wallet_accounts
       SET cash_balance_cents = cash_balance_cents - p_credits_cents,
           updated_at = now()
     WHERE id = v_wallet_id;
  END IF;

  UPDATE care_plans
     SET credit_applied_cents = p_credits_cents,
         credit_redemption_id = v_new_credit_id,
         updated_at = NOW()
   WHERE id = p_care_plan_id;

  RETURN QUERY SELECT p_credits_cents, v_new_credit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_credits_for_payment(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.redeem_credits_for_payment(uuid, uuid, integer, integer) TO service_role;

COMMIT;
