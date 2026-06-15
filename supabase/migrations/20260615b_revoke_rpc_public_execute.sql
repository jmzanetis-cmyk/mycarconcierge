-- ============================================================================
-- 20260615b_revoke_rpc_public_execute.sql
-- Security hardening: restrict wallet/credits RPCs to service_role only.
--
-- Two-layer defense:
--   Layer 1: REVOKE EXECUTE from anon + authenticated (removes the grant).
--   Layer 2: Guard at top of each function body — raises if caller's JWT role
--            is not 'service_role', so a future GRANT can't silently reopen
--            the hole.
--
-- Guard expression used throughout:
--   coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role'
-- Handles: NULL (no JWT context) → '{}' → NULL role → guard fires.
--          ''  (empty setting)  → NULL → '{}' → NULL role → guard fires.
--          service_role JWT     → 'service_role' → guard passes.
-- ============================================================================

-- ── Layer 1: REVOKE ───────────────────────────────────────────────────────────
REVOKE EXECUTE
  ON FUNCTION public.wallet_load(uuid, text, integer, integer, text, text)
  FROM anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.wallet_spend(uuid, text, integer, text, text)
  FROM anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.wallet_refund(uuid, text, integer, text, text)
  FROM anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.expire_wallet_bonus_lots()
  FROM anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.redeem_credits_for_payment(uuid, uuid, integer)
  FROM anon, authenticated;

-- ── Layer 2: Harden function bodies ──────────────────────────────────────────

-- wallet_load ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_load(
  p_owner_id              uuid,
  p_owner_type            text,
  p_cash_cents            integer,
  p_bonus_cents           integer DEFAULT 0,
  p_stripe_payment_intent text    DEFAULT NULL,
  p_description           text    DEFAULT NULL
)
RETURNS TABLE(cash_balance_cents integer, bonus_balance_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id   uuid;
  v_cash_after  int;
  v_bonus_after int;
  v_lot_id      uuid;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')
       ::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;

  IF p_cash_cents < 0 THEN
    RAISE EXCEPTION 'cash_cents cannot be negative';
  END IF;

  INSERT INTO public.wallet_accounts (owner_id, owner_type)
  VALUES (p_owner_id, p_owner_type)
  ON CONFLICT (owner_id, owner_type) DO NOTHING;

  SELECT id, wa.cash_balance_cents, wa.bonus_balance_cents
    INTO v_wallet_id, v_cash_after, v_bonus_after
    FROM public.wallet_accounts wa
   WHERE owner_id = p_owner_id AND owner_type = p_owner_type
     FOR UPDATE;

  v_cash_after  := v_cash_after  + p_cash_cents;
  v_bonus_after := v_bonus_after + p_bonus_cents;

  IF p_cash_cents > 0 THEN
    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents, ref_id, description
    ) VALUES (
      v_wallet_id, 'load_cash', p_cash_cents, v_cash_after,
      p_stripe_payment_intent, COALESCE(p_description, 'Wallet top-up')
    );
  END IF;

  IF p_bonus_cents > 0 THEN
    INSERT INTO public.wallet_bonus_lots (wallet_id, amount_cents, remaining_cents, expires_at)
    VALUES (v_wallet_id, p_bonus_cents, p_bonus_cents, now() + interval '180 days')
    RETURNING id INTO v_lot_id;

    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents, lot_id, description
    ) VALUES (
      v_wallet_id, 'load_bonus', p_bonus_cents, v_bonus_after,
      v_lot_id, COALESCE(p_description, 'Bonus credit')
    );
  END IF;

  UPDATE public.wallet_accounts
     SET cash_balance_cents  = v_cash_after,
         bonus_balance_cents = v_bonus_after,
         updated_at = now()
   WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_cash_after, v_bonus_after;
END;
$$;

-- wallet_spend ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_spend(
  p_owner_id     uuid,
  p_owner_type   text,
  p_amount_cents integer,
  p_ref_id       text DEFAULT NULL,
  p_description  text DEFAULT NULL
)
RETURNS TABLE(cash_spent_cents integer, bonus_spent_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id   uuid;
  v_cash_bal    int;
  v_bonus_bal   int;
  v_remain      int;
  v_lot         RECORD;
  v_lot_debit   int;
  v_bonus_spent int := 0;
  v_cash_spent  int;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')
       ::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  SELECT id, cash_balance_cents, bonus_balance_cents
    INTO v_wallet_id, v_cash_bal, v_bonus_bal
    FROM public.wallet_accounts
   WHERE owner_id = p_owner_id AND owner_type = p_owner_type
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found for owner';
  END IF;

  IF (v_cash_bal + v_bonus_bal) < p_amount_cents THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  v_remain := p_amount_cents;

  FOR v_lot IN
    SELECT id, remaining_cents FROM public.wallet_bonus_lots
     WHERE wallet_id = v_wallet_id AND remaining_cents > 0
     ORDER BY expires_at, id
       FOR UPDATE
  LOOP
    EXIT WHEN v_remain = 0;
    v_lot_debit := LEAST(v_lot.remaining_cents, v_remain);

    UPDATE public.wallet_bonus_lots
       SET remaining_cents = remaining_cents - v_lot_debit
     WHERE id = v_lot.id;

    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents,
      lot_id, ref_id, description
    ) VALUES (
      v_wallet_id, 'spend_bonus', -v_lot_debit,
      v_bonus_bal - v_bonus_spent - v_lot_debit,
      v_lot.id, p_ref_id, p_description
    );

    v_bonus_spent := v_bonus_spent + v_lot_debit;
    v_remain      := v_remain - v_lot_debit;
  END LOOP;

  v_cash_spent := v_remain;
  IF v_cash_spent > 0 THEN
    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents,
      ref_id, description
    ) VALUES (
      v_wallet_id, 'spend_cash', -v_cash_spent,
      v_cash_bal - v_cash_spent,
      p_ref_id, p_description
    );
  END IF;

  UPDATE public.wallet_accounts
     SET cash_balance_cents  = v_cash_bal  - v_cash_spent,
         bonus_balance_cents = v_bonus_bal - v_bonus_spent,
         updated_at = now()
   WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_cash_spent, v_bonus_spent;
END;
$$;

-- wallet_refund ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_refund(
  p_owner_id     uuid,
  p_owner_type   text,
  p_amount_cents integer,
  p_ref_id       text DEFAULT NULL,
  p_description  text DEFAULT NULL
)
RETURNS TABLE(cash_balance_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id  uuid;
  v_cash_after int;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')
       ::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  SELECT id, cash_balance_cents
    INTO v_wallet_id, v_cash_after
    FROM public.wallet_accounts
   WHERE owner_id = p_owner_id AND owner_type = p_owner_type
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found for owner';
  END IF;

  v_cash_after := v_cash_after + p_amount_cents;

  INSERT INTO public.wallet_ledger (
    wallet_id, entry_type, amount_cents, balance_after_cents, ref_id, description
  ) VALUES (
    v_wallet_id, 'refund_cash', p_amount_cents, v_cash_after,
    p_ref_id, COALESCE(p_description, 'Refund')
  );

  UPDATE public.wallet_accounts
     SET cash_balance_cents = v_cash_after,
         updated_at = now()
   WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_cash_after;
END;
$$;

-- expire_wallet_bonus_lots ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_wallet_bonus_lots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot    RECORD;
  v_wallet RECORD;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')
       ::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;

  FOR v_lot IN
    SELECT bl.id, bl.wallet_id, bl.remaining_cents
      FROM public.wallet_bonus_lots bl
     WHERE bl.expires_at <= now() AND bl.remaining_cents > 0
       FOR UPDATE SKIP LOCKED
  LOOP
    SELECT id, bonus_balance_cents INTO v_wallet
      FROM public.wallet_accounts WHERE id = v_lot.wallet_id FOR UPDATE;

    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents, lot_id, description
    ) VALUES (
      v_lot.wallet_id, 'expire_bonus', -v_lot.remaining_cents,
      v_wallet.bonus_balance_cents - v_lot.remaining_cents,
      v_lot.id, 'Bonus lot expired'
    );

    UPDATE public.wallet_accounts
       SET bonus_balance_cents = bonus_balance_cents - v_lot.remaining_cents,
           updated_at = now()
     WHERE id = v_lot.wallet_id;

    UPDATE public.wallet_bonus_lots
       SET remaining_cents = 0
     WHERE id = v_lot.id;
  END LOOP;
END;
$$;

-- redeem_credits_for_payment ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_credits_for_payment(
  p_member_id     uuid,
  p_care_plan_id  uuid,
  p_credits_cents integer
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

  IF p_credits_cents > ROUND(v_escrow_amount * 100) THEN
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
