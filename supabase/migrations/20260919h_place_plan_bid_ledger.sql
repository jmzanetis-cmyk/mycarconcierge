-- ============================================================================
-- Phase 1 §1.3 — rewrite place_plan_bid to spend from credit_ledger lots.
--
-- Replaces the two-step counter decrement in
-- 20260921f_auto_bid_automatic_submission.sql with lot selection in the
-- order required by spec §4.3:
--
--   1. founder/trial lots   (oldest first)
--   2. subscription lots    (earliest expires_at, then oldest)
--   3. pack/bonus/admin/opening lots (oldest first)
--
-- A "lot" is a positive-delta row in credit_ledger. Remaining balance per
-- lot = delta + SUM(child.delta WHERE child.lot_id = lot.id). A lot is
-- exhausted when remaining <= 0.
--
-- Signature and return shape are IDENTICAL to the pre-ledger version:
-- (bid_id, consumed_source, remaining_free, remaining_credits). Callers
-- (plan-bids.js, auto-bid-engine-scheduled.js, auto-bid-prefill.js,
-- auto-bid-prefill-notify-scheduled.js) don't need to change.
-- consumed_source stays in {'free_trial','credits'} so no caller has to
-- learn the new lot vocabulary.
--
-- Concurrency: pg_advisory_xact_lock keyed by provider_id serializes all
-- ledger writes for one provider inside a transaction, so two racing
-- bids can't both spend the same last-credit-lot. Two providers can bid
-- concurrently — the lock is per-provider.
-- ============================================================================

DROP FUNCTION IF EXISTS public.place_plan_bid(uuid, uuid, numeric, text, boolean);

CREATE OR REPLACE FUNCTION public.place_plan_bid(
  p_provider_id  uuid,
  p_care_plan_id uuid,
  p_amount       numeric,
  p_note         text,
  p_is_auto_bid  boolean DEFAULT false
)
RETURNS TABLE(
  bid_id            uuid,
  consumed_source   text,
  remaining_free    int,
  remaining_credits int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bid_id       uuid;
  v_lot_id       bigint;
  v_lot_source   text;
  v_consumed_src text;
  v_free         int;
  v_credits      int;
BEGIN
  -- Layer 2 guard — service_role only, same as pre-ledger.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized: service_role required' USING ERRCODE = '42501';
  END IF;

  IF p_provider_id IS NULL OR p_care_plan_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent bids for the same provider so lot selection can't
  -- race. Released at commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtext(p_provider_id::text));

  -- Pick the highest-priority lot with remaining > 0. `remaining` is the
  -- grant delta plus the (negative) sum of spends against that lot.
  WITH lots AS (
    SELECT g.id,
           g.source,
           g.expires_at,
           g.created_at,
           g.delta + COALESCE(
             (SELECT SUM(s.delta) FROM public.credit_ledger s WHERE s.lot_id = g.id),
             0
           ) AS remaining
    FROM public.credit_ledger g
    WHERE g.provider_id = p_provider_id
      AND g.delta > 0
      AND (g.expires_at IS NULL OR g.expires_at > now())
  )
  SELECT id, source
    INTO v_lot_id, v_lot_source
    FROM lots
   WHERE remaining > 0
   ORDER BY
     CASE
       WHEN source IN ('founder','trial') THEN 1
       WHEN source = 'subscription'       THEN 2
       ELSE 3
     END,
     expires_at NULLS LAST,
     created_at
   LIMIT 1;

  IF v_lot_id IS NULL THEN
    RAISE EXCEPTION 'no_credits_available' USING ERRCODE = 'P0001';
  END IF;

  -- Insert the bid first — if duplicate_bid fires, no spend row lands.
  BEGIN
    INSERT INTO public.plan_bids (care_plan_id, provider_id, amount, note, is_auto_bid, status)
    VALUES (p_care_plan_id, p_provider_id, p_amount, p_note, COALESCE(p_is_auto_bid, false), 'pending')
    RETURNING id INTO v_bid_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate_bid' USING ERRCODE = 'P0002';
  END;

  -- Record the spend against the picked lot. The AFTER INSERT cache trigger
  -- on credit_ledger will refresh profiles.bid_credits + free_trial_bids
  -- to match the new ledger sum before we read them below.
  INSERT INTO public.credit_ledger (
    provider_id, delta, source, lot_id, ref_type, ref_id
  ) VALUES (
    p_provider_id, -1, 'bid', v_lot_id, 'plan_bid', v_bid_id::text
  );

  -- Read the post-spend cache. Trigger has already updated these rows.
  SELECT COALESCE(free_trial_bids, 0), COALESCE(bid_credits, 0)
    INTO v_free, v_credits
    FROM public.profiles
   WHERE id = p_provider_id;

  -- Preserve the pre-ledger consumed_source vocabulary — callers already
  -- map on 'free_trial' vs 'credits'. Founder + trial map to 'free_trial';
  -- everything else maps to 'credits'.
  v_consumed_src := CASE
    WHEN v_lot_source IN ('founder','trial') THEN 'free_trial'
    ELSE 'credits'
  END;

  RETURN QUERY SELECT v_bid_id, v_consumed_src, v_free, v_credits;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.place_plan_bid(uuid, uuid, numeric, text, boolean)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.place_plan_bid(uuid, uuid, numeric, text, boolean)
  TO service_role;
