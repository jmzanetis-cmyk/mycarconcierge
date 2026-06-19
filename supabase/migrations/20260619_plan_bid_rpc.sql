-- ============================================================================
-- 20260619_plan_bid_rpc.sql
-- place_plan_bid — atomic credit decrement + plan_bids insert
--
-- Why this exists:
--   The /api/plan-bids endpoint must decrement a provider's bid credit and
--   insert a plan_bids row as a single atomic operation. Doing it in two
--   round-trips from JS (read profile → update credit → insert bid) is
--   vulnerable to:
--     (a) double-spend: two concurrent bids each read the same credit count
--         and each decrement, spending one credit for two bids.
--     (b) partial state: credit decrements but the insert fails (e.g., dup
--         on the UNIQUE(care_plan_id, provider_id) constraint), leaving the
--         provider charged for a bid they never placed.
--
--   This RPC runs both steps in a single transaction. If the insert fails,
--   the credit decrement is rolled back automatically.
--
-- Drain order: free_trial_bids first, then bid_credits — matches the legacy
-- `handleSubmitBid` consumption order (server.js:10570-10574).
--
-- The endpoint is the authoritative gate for role / verification / suspension
-- (see netlify/functions/plan-bids.js). This RPC enforces only the atomic
-- credit-and-insert mechanic; it does NOT re-check the provider's bidding
-- eligibility. That keeps the RPC focused and reusable.
--
-- Security: two layers per the 20260615b convention.
--   Layer 1: REVOKE EXECUTE from anon + authenticated.
--   Layer 2: Guard at top of function body verifying the JWT claim is
--            service_role, so a future GRANT can't silently reopen the hole.
-- ============================================================================

DROP FUNCTION IF EXISTS public.place_plan_bid(uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.place_plan_bid(
  p_provider_id  uuid,
  p_care_plan_id uuid,
  p_amount       numeric,
  p_note         text
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
  -- ── Layer 2 guard: caller JWT must be service_role ─────────────────────────
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized: service_role required' USING ERRCODE = '42501';
  END IF;

  -- Argument sanity. Endpoint validates too, but defensive.
  IF p_provider_id IS NULL OR p_care_plan_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- ── Atomic decrement: try free_trial_bids first ───────────────────────────
  UPDATE profiles
     SET free_trial_bids = free_trial_bids - 1
   WHERE id = p_provider_id
     AND COALESCE(free_trial_bids, 0) > 0
  RETURNING free_trial_bids, COALESCE(bid_credits, 0)
       INTO v_free, v_credits;

  IF FOUND THEN
    v_source := 'free_trial';
  ELSE
    -- Fall through to bid_credits
    UPDATE profiles
       SET bid_credits = bid_credits - 1
     WHERE id = p_provider_id
       AND COALESCE(bid_credits, 0) > 0
    RETURNING COALESCE(free_trial_bids, 0), bid_credits
         INTO v_free, v_credits;

    IF FOUND THEN
      v_source := 'credits';
    ELSE
      -- Neither bucket had anything left.
      RAISE EXCEPTION 'no_credits_available' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── Insert the bid ────────────────────────────────────────────────────────
  -- A duplicate (same provider already bid on this care_plan) raises
  -- 23505 (unique_violation) which we re-raise as 'duplicate_bid' so the
  -- endpoint can map it to a 409 with the right error sentinel. The whole
  -- function runs in a single transaction, so the credit decrement above
  -- rolls back automatically on this path.
  BEGIN
    INSERT INTO plan_bids (care_plan_id, provider_id, amount, note, is_auto_bid, status)
    VALUES (p_care_plan_id, p_provider_id, p_amount, p_note, false, 'pending')
    RETURNING id INTO v_bid_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate_bid' USING ERRCODE = 'P0002';
  END;

  RETURN QUERY SELECT v_bid_id, v_source, v_free, v_credits;
END;
$$;

-- ── Layer 1: REVOKE ─────────────────────────────────────────────────────────
REVOKE EXECUTE
  ON FUNCTION public.place_plan_bid(uuid, uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.place_plan_bid(uuid, uuid, numeric, text)
  TO service_role;
