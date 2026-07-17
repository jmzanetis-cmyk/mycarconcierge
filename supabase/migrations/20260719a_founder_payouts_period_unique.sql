-- ============================================================================
-- 20260719a — founder_payouts: unique (founder_id, payout_period) + atomic
--             pending_balance RPC.
--
-- Phase 1b audit Findings #5/#6 close-out.
--
-- PART A — unique index race backstop for founder-payout-monthly-scheduled.js.
--   The cron uses a check-then-insert dedupe on (founder_id, payout_period)
--   which has a race window if two instances collide (unlikely for a scheduled
--   function, but possible on manual re-run or after a transient DB blip).
--   This unique index is the hard backstop: a second insert for the same tuple
--   fails with 23505, which the caller catches as a no-op ("already paid").
--
-- ⚠️  PRE-APPLY WARNING (2026-07-19): pre-check found 1 EXISTING VIOLATOR:
--     founder_id = 331d73c1-2787-4c38-b701-58c300e456a1
--     payout_period = '2026-02'
--     duplicate_count = 3
--   This migration was NOT applied to prod on 2026-07-19 because
--   `CREATE UNIQUE INDEX` would fail on existing duplicates. Manual dedup
--   required first: pick the canonical row for that (founder, period) tuple
--   (probably the most-recently-completed or the oldest, depending on
--   what actually got paid via Stripe), and delete the two others. Then
--   apply this migration via Supabase MCP or Studio. Verify with:
--     select indexname, indexdef from pg_indexes
--     where tablename='founder_payouts'
--       and indexname='founder_payouts_founder_period_unique';
--
-- PART B — atomic pending_balance decrement helper.
--   founder-payout-monthly-scheduled.js used to snapshot pending_balance +
--   total_commissions_paid, then write both back. Concurrent commission
--   inserts arriving in the same window would be silently overwritten
--   (classic lost update). This RPC does both mutations in a single UPDATE
--   using arithmetic in the SET clause — no snapshot read, no race window.
--   Called from the monthly scheduled function after each successful payout.
-- ============================================================================
BEGIN;

-- PART A — unique index backstop.
CREATE UNIQUE INDEX IF NOT EXISTS founder_payouts_founder_period_unique
  ON founder_payouts (founder_id, payout_period);

-- PART B — atomic decrement helper.
CREATE OR REPLACE FUNCTION public.apply_founder_payout_atomic(
  p_founder_id uuid,
  p_amount     numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')
       ::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;
  UPDATE public.member_founder_profiles
     SET pending_balance        = GREATEST(0, COALESCE(pending_balance, 0) - p_amount),
         total_commissions_paid = COALESCE(total_commissions_paid, 0) + p_amount,
         updated_at             = NOW()
   WHERE id = p_founder_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_founder_payout_atomic(uuid, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_founder_payout_atomic(uuid, numeric) TO service_role;

COMMIT;
