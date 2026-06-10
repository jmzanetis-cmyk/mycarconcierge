-- ============================================================================
-- record_bid_pack_commission v2 — single writer, both dedup columns, balance update
--
-- Changes from v1 (20260515b):
--   1. Sets source_transaction_id = p_transaction_id in addition to
--      transaction_id, so every row written through this RPC is findable
--      by either column. Eliminates the dual-column confusion where the
--      webhook keyed on source_transaction_id and the RPC on transaction_id.
--
--   2. Updates member_founder_profiles.pending_balance and
--      total_commissions_earned after a successful INSERT. Previously the
--      webhook's _recordBidPackFounderCommission did this manually after
--      calling the RPC; moving it into the RPC makes the operation atomic
--      and removes the responsibility from the caller.
--
--   3. Return type is still uuid (the inserted commission id) or NULL for
--      no-commission / idempotent-duplicate cases.
--
-- The webhook now just calls:
--   supabase.rpc('record_bid_pack_commission', {
--     p_provider_id, p_purchase_amount, p_transaction_id
--   })
-- and reads the returned id. No post-call balance update needed.
-- ============================================================================

DROP FUNCTION IF EXISTS public.record_bid_pack_commission(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.record_bid_pack_commission(
  p_provider_id     uuid,
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

  -- 3) Insert the canonical pending row. Catches unique_violation on
  --    transaction_id rather than using ON CONFLICT so the RPC is idempotent
  --    regardless of whether the index is a constraint or a partial index.
  --    Both transaction_id and source_transaction_id are set to p_transaction_id
  --    so rows are findable by either column (used by different callers).
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
      source_transaction_id,
      description,
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
      p_transaction_id,
      'Bid pack commission (' || ROUND(v_commission_rate * 100) || '%) — webhook',
      'pending',
      NOW(),
      NOW()
    )
    RETURNING id INTO v_commission_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Concurrent webhook delivery already wrote this row — idempotent return.
      RETURN NULL;
  END;

  -- 4) Update the founder's running balance. Use a subquery snapshot to avoid
  --    a lost-update race with concurrent commission inserts on the same founder.
  UPDATE public.member_founder_profiles
     SET total_commissions_earned = COALESCE(total_commissions_earned, 0) + v_commission_amount,
         pending_balance          = COALESCE(pending_balance, 0)          + v_commission_amount,
         updated_at               = NOW()
   WHERE id = v_founder_id;

  RETURN v_commission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.record_bid_pack_commission(uuid, numeric, text) IS
  'v2: inserts a pending founder_commissions row for a bid-pack purchase and '
  'atomically updates member_founder_profiles.pending_balance. Sets both '
  'transaction_id and source_transaction_id to p_transaction_id. Idempotent '
  'on transaction_id. service_role only.';
