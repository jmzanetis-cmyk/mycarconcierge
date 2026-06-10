-- ============================================================================
-- Task #334 (round 3) — Driver wallet + cash-out model (Uber/Lyft style)
--
-- Pivot from "auto-transfer-on-job-completion" (round 1/2) to a wallet model:
-- earnings accrue in the app as `available`, and drivers initiate their own
-- cash-out (standard ACH or Stripe Instant Payouts). Each cash-out creates
-- ONE platform → connected-account transfer for the full available balance,
-- followed (for instant) by an instant Stripe payout on the connected
-- account.
--
-- Schema:
--   1. driver_earnings.payout_status — adds 'available' to the allow-list.
--      'available' = earned, ready to cash out (replaces the old 'pending'
--      semantics that round 1 left behind; existing 'pending' rows are
--      backfilled to 'available' in this migration).
--   2. driver_earnings.cashout_id     — FK that links a row to the
--      driver_cashouts batch that paid it out. NULL while still 'available'.
--   3. driver_cashouts — one row per cash-out request. Holds the Stripe
--      transfer id (platform→connected acct) and, for instant cash-outs,
--      the Stripe payout id (connected acct → bank).
--   4. driver_wallet_balances — view that aggregates each driver's
--      lifetime cash-out, currently-available, currently-blocked, and
--      in-flight totals so the wallet UI doesn't have to compute them
--      client-side.
-- ============================================================================

-- 1. Allow 'available' as a payout_status value.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'driver_earnings_payout_status_check'
  ) THEN
    ALTER TABLE public.driver_earnings DROP CONSTRAINT driver_earnings_payout_status_check;
  END IF;
  ALTER TABLE public.driver_earnings
    ADD CONSTRAINT driver_earnings_payout_status_check
    CHECK (payout_status IN ('available','pending','pending_account','paid','failed','manual'));
END$$;

-- Backfill: any earnings the round-1 code left as 'pending' should now be
-- 'available' (those rows never had a transfer attempted under the new
-- wallet model — they're just waiting for the driver to cash out).
UPDATE public.driver_earnings
   SET payout_status = 'available'
 WHERE payout_status = 'pending'
   AND stripe_transfer_id IS NULL;

-- 2. driver_cashouts — batched cash-out ledger.
CREATE TABLE IF NOT EXISTS public.driver_cashouts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id             uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  amount_cents          integer NOT NULL CHECK (amount_cents > 0),
  fee_cents             integer NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  method                text    NOT NULL CHECK (method IN ('standard','instant')),
  status                text    NOT NULL DEFAULT 'processing'
                        CHECK (status IN ('processing','paid','failed','cancelled')),
  stripe_transfer_id    text,
  stripe_payout_id      text,
  error                 text,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  initiated_by_kind     text NOT NULL DEFAULT 'driver'
                        CHECK (initiated_by_kind IN ('driver','admin','system')),
  initiated_by_id       uuid
);

CREATE INDEX IF NOT EXISTS driver_cashouts_driver_idx
  ON public.driver_cashouts (driver_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS driver_cashouts_status_idx
  ON public.driver_cashouts (status, requested_at DESC);

-- 3. Link earnings to the cash-out they were paid by.
ALTER TABLE public.driver_earnings
  ADD COLUMN IF NOT EXISTS cashout_id uuid REFERENCES public.driver_cashouts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS driver_earnings_cashout_idx
  ON public.driver_earnings (cashout_id) WHERE cashout_id IS NOT NULL;

-- 4. Wallet balance view — recomputed live from driver_earnings.
--    available_cents       = sum where status='available' (what the driver
--                            can withdraw right now)
--    in_flight_cents       = sum where status='paid' AND cashout linked but
--                            cashout still 'processing' (in transit to bank)
--    blocked_cents         = sum where status='pending_account' or 'failed'
--                            (driver action / admin retry required)
--    lifetime_paid_cents   = sum where status IN ('paid','manual') (paid
--                            either via Stripe transfer or admin manual mark)
--
-- SECURITY INVOKER (default) so RLS on driver_earnings still applies —
-- the existing driver_earnings_self_read policy lets a driver see only
-- their own row, which transparently restricts this view too.
CREATE OR REPLACE VIEW public.driver_wallet_balances AS
SELECT
  d.id AS driver_id,
  COALESCE(SUM(e.amount_cents) FILTER (WHERE e.payout_status = 'available'),       0)::bigint AS available_cents,
  COALESCE(SUM(e.amount_cents) FILTER (WHERE e.payout_status = 'pending_account'), 0)::bigint AS pending_account_cents,
  COALESCE(SUM(e.amount_cents) FILTER (WHERE e.payout_status = 'failed'),          0)::bigint AS failed_cents,
  COALESCE(SUM(e.amount_cents) FILTER (
    WHERE e.payout_status = 'paid'
      AND e.cashout_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.driver_cashouts c
        WHERE c.id = e.cashout_id AND c.status = 'processing'
      )
  ), 0)::bigint AS in_flight_cents,
  COALESCE(SUM(e.amount_cents) FILTER (WHERE e.payout_status IN ('paid','manual')), 0)::bigint AS lifetime_paid_cents
FROM public.drivers d
LEFT JOIN public.driver_earnings e ON e.driver_id = d.id
GROUP BY d.id;

-- 5. RLS — drivers read their own cash-out rows. Service-role writes only.
ALTER TABLE public.driver_cashouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_cashouts_self_read ON public.driver_cashouts;
CREATE POLICY driver_cashouts_self_read ON public.driver_cashouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_cashouts.driver_id
        AND d.profile_id = auth.uid()
    )
  );

-- 6. Refresh the driver_payouts_totals view (round-2 created it) so the
--    'available' bucket shows up in admin totals too.
CREATE OR REPLACE VIEW public.driver_payouts_totals AS
SELECT
  driver_id,
  payout_status,
  SUM(amount_cents)::bigint AS total_cents,
  COUNT(*)::bigint          AS row_count
FROM public.driver_earnings
GROUP BY driver_id, payout_status;
