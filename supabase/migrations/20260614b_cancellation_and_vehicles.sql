-- ============================================================================
-- Driver Cancellation Policy + Multi-Vehicle Support
--
-- Ships dark: FEATURE_CANCELLATION_POLICY and FEATURE_MULTI_VEHICLE env vars
-- must each be 'true' to activate at runtime.
--
-- Decision default applied:
--   (b) driver_vehicles already exists — this migration extends it with
--       approval columns rather than recreating it.
--
-- Wallet dependency: cancellation_payouts.wallet_debit_id FKs to
-- wallet_ledger (migration 20260614a). Apply wallet migration first.
-- ============================================================================

-- ── Part A: driver timeout ──────────────────────────────────────────────────
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS timeout_until timestamptz;

-- ── Part B: driver_vehicles approval gate ──────────────────────────────────
ALTER TABLE public.driver_vehicles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Single-active-primary invariant: at most one active primary per driver.
-- SKIP if the index already exists (driver repo may have added it independently).
CREATE UNIQUE INDEX IF NOT EXISTS driver_vehicles_one_primary
  ON public.driver_vehicles (driver_id)
  WHERE is_primary = true AND is_active = true;

-- ── Part C: ride_cancellations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ride_cancellations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  concierge_job_id   uuid        NOT NULL UNIQUE REFERENCES public.concierge_jobs(id) ON DELETE RESTRICT,
  cancelled_by_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cancelled_by_role  text        NOT NULL CHECK (cancelled_by_role IN ('member','driver','admin')),
  fault              text        NOT NULL CHECK (fault IN ('passenger','driver','none')),
  reason             text,
  cancellation_time  timestamptz NOT NULL DEFAULT now(),
  notice_hours_given numeric,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_cancellations_job_idx
  ON public.ride_cancellations (concierge_job_id);
CREATE INDEX IF NOT EXISTS ride_cancellations_cancelled_by_idx
  ON public.ride_cancellations (cancelled_by_id);

-- ── Part D: cancellation_payouts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cancellation_payouts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_id  uuid        NOT NULL REFERENCES public.ride_cancellations(id) ON DELETE RESTRICT,
  driver_id        uuid        NOT NULL REFERENCES public.drivers(id)            ON DELETE RESTRICT,
  fee_cents        integer     NOT NULL CHECK (fee_cents >= 0),
  wallet_debit_id  uuid        REFERENCES public.wallet_ledger(id)              ON DELETE SET NULL,
  stripe_pi_id     text,
  status           text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','waived')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cancellation_payouts_cancellation_idx
  ON public.cancellation_payouts (cancellation_id);
CREATE INDEX IF NOT EXISTS cancellation_payouts_driver_idx
  ON public.cancellation_payouts (driver_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.ride_cancellations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_ride_cancellations
  ON public.ride_cancellations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_cancellation_payouts
  ON public.cancellation_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Members can see cancellations on their own jobs
CREATE POLICY member_read_own_cancellations ON public.ride_cancellations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.concierge_jobs j
       WHERE j.id = ride_cancellations.concierge_job_id
         AND j.member_id = auth.uid()
    )
  );
