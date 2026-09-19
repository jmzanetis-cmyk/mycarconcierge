-- ============================================================================
-- Phase 1 addendum — align Chris Agrapidis's DB state with his founder deal.
--
-- Audit (2026-09-19):
--   • profiles.id = dbb15523-2441-4ad9-8d2d-c6d8812c7ca2
--   • Live values before this migration:
--       - is_founding_provider = false   (should be true — Chris IS a
--         founding provider per docs/CAR_CLUB_COMPLETION_PLAN.md §2a)
--       - bid_credits = 60,000           (direct seed grant, not the
--         999999 path from provider-onboarding.js finalize)
--       - free_trial_bids = 3            (standard signup allotment)
--   • 20260919g's backfill classified his 60,000 as source='opening'.
--     Given the founder-deal record, that's the wrong lot type: opening
--     lots are treated as pack/bonus/admin-tier in place_plan_bid's spend
--     order, which would mean Chris spends this balance ahead of any
--     pack he later buys. Reclassify to `founder` so it spends FIRST
--     per spec §4.3 spend order, and never expires.
--
-- Two changes:
--   1. profiles.is_founding_provider → true for Chris.
--   2. credit_ledger row for Chris's 60,000 opening balance → source
--      changed to 'founder'. Migrations are the one legit place to
--      mutate the ledger past-tense; runtime writes stay append-only.
--   3. Recompute Chris's profiles cache to match the new ledger sums
--      (bid_credits goes to 0; free_trial_bids goes to 60,003 = 60000 + 3).
--
-- Leaves the amount at 60,000 intentionally. Do NOT "correct" this to
-- 999,999 in a future migration — 60,000 is what he was actually
-- granted, is functionally unlimited at any realistic bidding volume,
-- and matches what's already been visible in his account.
--
-- Same trigger-safe path as 20260919g's cache trigger: this migration
-- runs as postgres, so the UPDATE on profiles bypasses 20260918c's
-- privileged-columns guard (current_user='postgres' is NOT IN
-- ('anon','authenticated'), so Bypass 1 fires).
-- ============================================================================


-- ---- 1. Mark Chris as founding provider ---------------------------------

UPDATE public.profiles
   SET is_founding_provider = true,
       updated_at = now()
 WHERE id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2';


-- ---- 2. Reclassify Chris's opening lot as a founder lot -----------------

UPDATE public.credit_ledger
   SET source = 'founder'
 WHERE provider_id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2'
   AND source = 'opening'
   AND delta   = 60000;


-- ---- 3. Recompute Chris's cache after the reclassification --------------
--
-- The AFTER INSERT trigger only fires on ledger INSERTs, not UPDATEs.
-- Since step 2 changed source without inserting a row, the cache is
-- stale for a beat; recompute in place.
UPDATE public.profiles
   SET
     free_trial_bids = COALESCE((
       SELECT SUM(delta) FROM public.credit_ledger
        WHERE provider_id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2'
          AND source IN ('founder','trial')
     ), 0),
     bid_credits = COALESCE((
       SELECT SUM(delta) FROM public.credit_ledger
        WHERE provider_id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2'
          AND source NOT IN ('founder','trial')
     ), 0),
     updated_at = now()
 WHERE id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2';


-- ---- 4. Sanity assertion ------------------------------------------------

DO $$
DECLARE
  v_bid_credits integer;
  v_free_trial integer;
  v_ledger_sum integer;
  v_founding boolean;
BEGIN
  SELECT bid_credits, free_trial_bids, is_founding_provider
    INTO v_bid_credits, v_free_trial, v_founding
    FROM public.profiles
   WHERE id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2';

  SELECT COALESCE(SUM(delta), 0) INTO v_ledger_sum
    FROM public.credit_ledger
   WHERE provider_id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2';

  IF NOT v_founding THEN
    RAISE EXCEPTION 'Chris.is_founding_provider still false after migration';
  END IF;
  IF v_bid_credits <> 0 THEN
    RAISE EXCEPTION 'Chris.bid_credits should be 0 after reclassification, got %', v_bid_credits;
  END IF;
  IF v_free_trial <> v_ledger_sum THEN
    RAISE EXCEPTION 'Chris ledger drift: cache free_trial=%, ledger sum=%', v_free_trial, v_ledger_sum;
  END IF;
END $$;
