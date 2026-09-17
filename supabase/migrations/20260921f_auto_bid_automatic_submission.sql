-- ============================================================================
-- 20260921f_auto_bid_automatic_submission.sql
--
-- Phase 8 of the auto-bid redesign — turns the master toggle into a REAL
-- automatic-submission switch. When a provider turns it on, matching jobs
-- are submitted as real bids (spending a bid credit) without a review
-- step. There is intentionally NO separate "auto-pay" control: bid
-- credits are a balance the provider already owns, so the pause toggle
-- alone is enough. Replaces the earlier notify-only Phase 8 draft that
-- previously used this same filename.
--
-- WHY DEFAULT true (paused/off) — critical for rollout safety:
--   The earlier notify-only Phase 8 draft had auto_bid_paused DEFAULT false
--   ("everyone stays opted in"). Under those semantics, opted-in meant
--   "get notified to review" — safe. Under THESE semantics, opted-in
--   means "spend real credits with no review." Shipping the same default
--   would silently switch every current rate-carded provider from
--   review-first to fully-automatic without them ever seeing the new
--   confirmation dialog. Default flips to true so Auto-Bid ships off for
--   everyone; a provider only gets automatic submission after going
--   through the confirmation flow in the UI.
--
-- STATE CORRECTION FOR PROD:
--   An earlier revision of this filename shipped auto_bid_paused with
--   DEFAULT false and was applied to prod during Phase 8 development
--   (Sep 16). This migration re-runs safely: the ADD COLUMN IF NOT EXISTS
--   is a no-op, and the ALTER COLUMN SET DEFAULT true + defensive UPDATE
--   correct the state. As of writing, provider_notification_preferences
--   has 0 rows, so the UPDATE is a no-op today — the write is defensive
--   against a race where a row lands between the earlier ADD and this
--   correction.
--
-- WHAT THIS FILE COVERS (all idempotent):
--   1. auto_bid_paused column — ADD IF NOT EXISTS + SET DEFAULT true +
--      defensive UPDATE of any lingering false → true.
--   2. auto_bid_max_price_cents column — nullable positive integer; null
--      means no cap.
--   3. plan_bid_id column on auto_bid_prefills — nullable FK to plan_bids.
--      Populated only for the 'auto_confirmed' status; links the prefill
--      row to the real bid the RPC created.
--   4. auto_bid_prefills.status CHECK — add 'auto_confirmed' to the
--      allowed set. The four existing values (pending/confirmed/dismissed/
--      expired) are preserved.
--   5. place_plan_bid RPC — DROP + CREATE with a new p_is_auto_bid boolean
--      parameter (default false) so the atomic credit-decrement + insert
--      can mark auto-submitted bids as is_auto_bid=true. Phase 5's
--      confirm-modal callers pass 4 named args and get the default of
--      false, matching current behavior.
--
-- FUTURE MIGRATION HYGIENE: the sibling `20260921e_auto_bid_phase1_cleanup`
-- file that dropped columns from the retired old system is unrelated to
-- this — do not confuse the two. This is additive-only.
-- ============================================================================

-- 1. auto_bid_paused — flip default + defensively update existing rows.
ALTER TABLE public.provider_notification_preferences
  ADD COLUMN IF NOT EXISTS auto_bid_paused boolean NOT NULL DEFAULT true;

ALTER TABLE public.provider_notification_preferences
  ALTER COLUMN auto_bid_paused SET DEFAULT true;

-- Any row inserted between an earlier revision of this file and now that
-- has auto_bid_paused=false is corrected to true. 0 rows in prod today,
-- so this is a defensive no-op; kept in case a race exists in another env.
UPDATE public.provider_notification_preferences
   SET auto_bid_paused = true
 WHERE auto_bid_paused = false;

-- 2. Price cap — null = no cap, otherwise positive integer cents.
ALTER TABLE public.provider_notification_preferences
  ADD COLUMN IF NOT EXISTS auto_bid_max_price_cents integer;

ALTER TABLE public.provider_notification_preferences
  DROP CONSTRAINT IF EXISTS provider_notification_preferences_auto_bid_max_price_cents_check;
ALTER TABLE public.provider_notification_preferences
  ADD CONSTRAINT provider_notification_preferences_auto_bid_max_price_cents_check
  CHECK (auto_bid_max_price_cents IS NULL OR auto_bid_max_price_cents > 0);

-- 3. plan_bid_id on auto_bid_prefills — set only for 'auto_confirmed' rows.
ALTER TABLE public.auto_bid_prefills
  ADD COLUMN IF NOT EXISTS plan_bid_id uuid REFERENCES public.plan_bids(id) ON DELETE SET NULL;

-- Fast reverse-lookup ("did we auto-submit for this bid?"). NULL-heavy
-- index is fine; the WHERE clause keeps it small.
CREATE INDEX IF NOT EXISTS auto_bid_prefills_plan_bid_id_idx
  ON public.auto_bid_prefills (plan_bid_id)
  WHERE plan_bid_id IS NOT NULL;

-- 4. Widen the status CHECK to include 'auto_confirmed'. DROP + re-add
-- rather than in-place alter because Postgres doesn't allow expanding a
-- CHECK's allowed-list without a rewrite of the constraint.
ALTER TABLE public.auto_bid_prefills
  DROP CONSTRAINT IF EXISTS auto_bid_prefills_status_check;
ALTER TABLE public.auto_bid_prefills
  ADD CONSTRAINT auto_bid_prefills_status_check
  CHECK (status IN ('pending', 'confirmed', 'dismissed', 'expired', 'auto_confirmed'));

-- 5. place_plan_bid RPC — new p_is_auto_bid boolean param (default false).
-- This is a DROP + CREATE (Postgres won't add params without one). Phase 5's
-- callers via supabase-js .rpc() use named args, so the added optional
-- param is backward-compatible: existing 4-arg calls resolve p_is_auto_bid
-- to the default of false, exactly matching the pre-Phase-8 behavior.
DROP FUNCTION IF EXISTS public.place_plan_bid(uuid, uuid, numeric, text);
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
  v_bid_id  uuid;
  v_source  text;
  v_free    int;
  v_credits int;
BEGIN
  -- Layer 2 guard: caller JWT must be service_role. Same as pre-Phase-8.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized: service_role required' USING ERRCODE = '42501';
  END IF;

  IF p_provider_id IS NULL OR p_care_plan_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Atomic decrement: free_trial_bids first, then bid_credits. Same order
  -- as the pre-Phase-8 function. If both hit zero, RAISE
  -- 'no_credits_available' with ERRCODE P0001 so the caller (Phase 5's
  -- confirm endpoint OR Phase 8's scheduled matcher) can map to their
  -- own error/notification path without ambiguity.
  UPDATE profiles
     SET free_trial_bids = free_trial_bids - 1
   WHERE id = p_provider_id
     AND COALESCE(free_trial_bids, 0) > 0
  RETURNING free_trial_bids, COALESCE(bid_credits, 0)
       INTO v_free, v_credits;

  IF FOUND THEN
    v_source := 'free_trial';
  ELSE
    UPDATE profiles
       SET bid_credits = bid_credits - 1
     WHERE id = p_provider_id
       AND COALESCE(bid_credits, 0) > 0
    RETURNING COALESCE(free_trial_bids, 0), bid_credits
         INTO v_free, v_credits;

    IF FOUND THEN
      v_source := 'credits';
    ELSE
      RAISE EXCEPTION 'no_credits_available' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Insert the bid. Now uses p_is_auto_bid (default false) so a
  -- Phase-8 auto-submitted bid is correctly marked is_auto_bid=true while
  -- Phase-5 confirm-modal bids stay is_auto_bid=false, no other changes.
  BEGIN
    INSERT INTO plan_bids (care_plan_id, provider_id, amount, note, is_auto_bid, status)
    VALUES (p_care_plan_id, p_provider_id, p_amount, p_note, COALESCE(p_is_auto_bid, false), 'pending')
    RETURNING id INTO v_bid_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate_bid' USING ERRCODE = 'P0002';
  END;

  RETURN QUERY SELECT v_bid_id, v_source, v_free, v_credits;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.place_plan_bid(uuid, uuid, numeric, text, boolean)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.place_plan_bid(uuid, uuid, numeric, text, boolean)
  TO service_role;
