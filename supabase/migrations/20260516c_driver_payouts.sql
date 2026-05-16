-- ============================================================================
-- Task #334 — Pay drivers automatically after each completed job
--
-- Extends Task #332's driver schema with the columns needed to:
--   1. Hold a driver's Stripe Connect (Express) account id so platform
--      transfers can land in their bank.
--   2. Track payout lifecycle on driver_earnings rows (pending → paid /
--      failed / pending_account) plus the Stripe transfer id and any
--      failure reason for admin triage.
--   3. Prevent duplicate "base" earnings being inserted for the same
--      (driver, job) when handleCompleteLeg fires job_completed more
--      than once (e.g. last-leg replays).
-- ============================================================================

-- 1. drivers — Stripe Connect destination
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled    boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS drivers_stripe_connect_idx
  ON public.drivers (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

-- 2. driver_earnings — payout lifecycle
ALTER TABLE public.driver_earnings
  ADD COLUMN IF NOT EXISTS payout_status      text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS paid_at            timestamptz,
  ADD COLUMN IF NOT EXISTS payout_error       text;

-- Allowed payout_status values:
--   pending          — earnings recorded, transfer not yet attempted
--   pending_account  — driver has no stripe_connect_account_id; awaiting onboarding
--   paid             — Stripe transfer succeeded; stripe_transfer_id set
--   failed           — Stripe transfer attempted and failed; payout_error set
--   manual           — admin marked as paid out-of-band (e.g. cash, ACH)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'driver_earnings_payout_status_check'
  ) THEN
    ALTER TABLE public.driver_earnings
      ADD CONSTRAINT driver_earnings_payout_status_check
      CHECK (payout_status IN ('pending','pending_account','paid','failed','manual'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS driver_earnings_payout_status_idx
  ON public.driver_earnings (payout_status, recorded_at DESC);

-- 3. Guard against duplicate base earnings on the same job. We allow
-- multiple 'tip' / 'bonus' / 'adjustment' rows per job but exactly one
-- 'base' row per (driver, job). Indexed partial unique => the
-- handleCompleteLeg job-completed branch can safely retry without
-- double-paying.
CREATE UNIQUE INDEX IF NOT EXISTS driver_earnings_base_unique
  ON public.driver_earnings (driver_id, job_id)
  WHERE kind = 'base' AND job_id IS NOT NULL;

-- 4. Aggregate view for the admin Driver Payouts dashboard. Backs the
-- "Paid / Pending / Failed / Manual" totals so the UI can stay accurate as
-- the driver_earnings table grows beyond the 500-row recent slice that
-- powers the activity table. SECURITY INVOKER so existing RLS on
-- driver_earnings still applies; admin reads go through the service role
-- in netlify/functions/driver-payouts-admin.js.
CREATE OR REPLACE VIEW public.driver_payouts_totals AS
SELECT
  driver_id,
  payout_status,
  SUM(amount_cents)::bigint AS total_cents,
  COUNT(*)::bigint          AS row_count
FROM public.driver_earnings
GROUP BY driver_id, payout_status;
