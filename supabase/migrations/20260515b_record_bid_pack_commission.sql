-- ============================================================================
-- Task #366 — Replace stub `record_bid_pack_commission` RPC with a working impl
--
-- Background
-- ----------
-- The bid-pack `checkout.session.completed` webhook in `www/server.js`
-- (around line 10743) calls:
--
--   supabase.rpc('record_bid_pack_commission', {
--     p_provider_id, p_purchase_amount, p_transaction_id
--   })
--
-- followed by `processInstantCommissionPayout(...)`. The previously deployed
-- function with this signature exists but is a no-op stub: it returns 204 with
-- no row inserted, even when the provider has an active referrer.
--
-- That broke the BATCHED-payout founder path:
--
--   processInstantCommissionPayout() returns early (without writing any row)
--   when the founder has `instant_payout_enabled = false`, no Stripe Connect
--   account, or `payout_preference != 'instant'`. Those founders rely on the
--   RPC to leave behind a `pending` `founder_commissions` row that a separate
--   batch process picks up later. With the stub in place, batched founders
--   silently lost every bid-pack commission.
--
-- (The instant-payout path kept working because
-- `processInstantCommissionPayout` has its own INSERT fallback when the row is
-- missing — that fallback still runs after this RPC.)
--
-- What this RPC does
-- ------------------
-- 1. Resolves the provider's `referred_by_founder_id` from `profiles`.
-- 2. Resolves the active founder row from `member_founder_profiles` by that
--    user_id (status='active').
-- 3. Computes `commission_rate = COALESCE(member_founder_profiles.commission_rate, 0.50)`.
--    The webhook's instant-payout path will overwrite the rate/amount on the
--    same row when applicable; for batched founders this is the final value.
-- 4. Inserts a `founder_commissions` row with status='pending' and
--    commission_type='bid_pack' inside an `ON CONFLICT (transaction_id)
--    DO NOTHING` so concurrent webhook deliveries are idempotent.
--
-- It returns the inserted commission row id (or NULL when no commission was
-- recorded — no referrer, founder not active, or duplicate transaction_id).
-- ============================================================================

-- The previously deployed stub returned a different type (void). Drop it first
-- so CREATE OR REPLACE can change the return type to uuid.
DROP FUNCTION IF EXISTS public.record_bid_pack_commission(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.record_bid_pack_commission(
  p_provider_id   uuid,
  p_purchase_amount numeric,
  p_transaction_id  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referred_by_founder_id uuid;
  v_founder_id             uuid;
  v_commission_rate        numeric;
  v_commission_amount      numeric;
  v_commission_id          uuid;
BEGIN
  IF p_provider_id IS NULL OR p_transaction_id IS NULL OR p_transaction_id = '' THEN
    RETURN NULL;
  END IF;

  IF p_purchase_amount IS NULL OR p_purchase_amount <= 0 THEN
    RETURN NULL;
  END IF;

  -- 1) Find the founder who referred this provider.
  SELECT referred_by_founder_id
    INTO v_referred_by_founder_id
    FROM public.profiles
   WHERE id = p_provider_id;

  IF v_referred_by_founder_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2) Resolve the active founder profile + their stored commission rate.
  SELECT id, COALESCE(commission_rate, 0.50)
    INTO v_founder_id, v_commission_rate
    FROM public.member_founder_profiles
   WHERE user_id = v_referred_by_founder_id
     AND status  = 'active'
   LIMIT 1;

  IF v_founder_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_commission_amount := ROUND((p_purchase_amount * v_commission_rate)::numeric, 2);

  -- 3) Insert the canonical pending row. The unique index on transaction_id
  --    may be defined as a partial / non-constraint index, so we use an
  --    explicit unique_violation handler instead of ON CONFLICT — that way the
  --    RPC stays idempotent regardless of how the index was created.
  BEGIN
    INSERT INTO public.founder_commissions (
      founder_id,
      referred_provider_id,
      commission_type,
      original_amount,
      purchase_amount,
      commission_rate,
      commission_amount,
      transaction_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_founder_id,
      p_provider_id,
      'bid_pack',
      p_purchase_amount,
      p_purchase_amount,
      v_commission_rate,
      v_commission_amount,
      p_transaction_id,
      'pending',
      NOW(),
      NOW()
    )
    RETURNING id INTO v_commission_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Another webhook delivery (or the instant-payout fallback INSERT in
      -- processInstantCommissionPayout) already wrote a row for this
      -- transaction_id. Nothing to do.
      RETURN NULL;
  END;

  RETURN v_commission_id;
END;
$$;

-- The webhook calls this from the Node server using the service-role key.
-- Grant execute to service_role ONLY — because the function is SECURITY
-- DEFINER and writes payout-bearing rows, granting it to `authenticated`
-- would let any logged-in user fabricate founder_commissions rows for
-- arbitrary providers/amounts. Lock it down to service_role and revoke
-- from anon, authenticated, and public so it can never be invoked from a
-- browser session.
REVOKE ALL ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) IS
  'Task #366: Inserts a pending founder_commissions row for a bid-pack '
  'purchase so batched-payout founders are not dropped. Idempotent on '
  'transaction_id. Called by the Stripe checkout.session.completed webhook '
  'before processInstantCommissionPayout().';
