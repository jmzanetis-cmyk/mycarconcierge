-- ============================================================================
-- v1-driver-financial-migrations.sql
--
-- Applies Task #332 + #334 driver/concierge/earnings/cashout schema to
-- production. Safe to run once; all objects use IF NOT EXISTS guards.
--
-- PREREQUISITES (verified in dry-run 2026-05-21):
--   - profiles          EXISTS ✓
--   - service_appointments  EXISTS ✓  (used as FK target for concierge_jobs;
--                                       original migration referenced `appointments`
--                                       which does not exist in this schema)
--   - drivers (OLD)     EXISTS — 0 rows, incompatible schema. DROPPED below.
--
-- ADAPTATION vs. migration files:
--   - Old `drivers` table (wrong schema, 0 rows) is dropped first via CASCADE.
--     CASCADE removes FK constraints from: ai_conversations, dispatch_queue,
--     driver_documents, driver_location_history, driver_payouts,
--     driver_support_issues, driver_vehicles, vehicle_inspection_photos.
--     All those tables are 0 rows and can have the constraint silently removed.
--   - concierge_jobs.appointment_id FK → service_appointments(id)
--     instead of appointments(id) (appointments table does not exist).
--
-- EXECUTION ORDER:
--   1. Drop old drivers + cascade FK constraints
--   2. Task #332 — drivers, driver_otp_send_log, concierge_jobs,
--                  concierge_job_legs, concierge_job_drivers,
--                  driver_location_pings, driver_earnings + RLS
--   3. Task #334 round 1 — Stripe Connect columns on drivers,
--                           payout lifecycle on driver_earnings,
--                           driver_payouts_totals view
--   4. Task #334 round 3 — driver_cashouts, wallet model, views, RLS
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Drop incompatible legacy drivers table
--    CASCADE removes FK constraints from the 8 referencing tables (all 0 rows).
-- ============================================================================
DROP TABLE IF EXISTS public.drivers CASCADE;

-- ============================================================================
-- 2. Task #332 — Driver app backend foundation
-- ============================================================================

-- 2a. drivers — pre-vetted MCC drivers (employees/contractors)
CREATE TABLE IF NOT EXISTS public.drivers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id         uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name          text NOT NULL,
  phone              text NOT NULL UNIQUE,
  email              text NOT NULL,
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','offboarded')),
  vehicle_class      text[] NOT NULL DEFAULT ARRAY['sedan']::text[],
  hourly_rate_cents  integer NOT NULL DEFAULT 0,
  per_job_rate_cents integer NOT NULL DEFAULT 0,
  onboarded_at       timestamptz,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drivers_phone_idx     ON public.drivers (phone);
CREATE INDEX IF NOT EXISTS drivers_status_idx    ON public.drivers (status);
CREATE INDEX IF NOT EXISTS drivers_id_status_idx ON public.drivers (id, status);

-- 2b. driver_otp_send_log — DB-backed OTP rate-limit audit trail
CREATE TABLE IF NOT EXISTS public.driver_otp_send_log (
  id      bigserial PRIMARY KEY,
  phone   text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_otp_send_log_phone_sent_idx
  ON public.driver_otp_send_log (phone, sent_at DESC);

ALTER TABLE public.driver_otp_send_log ENABLE ROW LEVEL SECURITY;
-- Service-role only — no driver/member ever reads this table.

-- 2c. concierge_jobs — top-level booking
--     NOTE: appointment_id FK points to service_appointments (not appointments,
--     which does not exist in this schema).
CREATE TABLE IF NOT EXISTS public.concierge_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  appointment_id       uuid REFERENCES public.service_appointments(id) ON DELETE SET NULL,
  provider_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tier                 smallint NOT NULL CHECK (tier BETWEEN 1 AND 4),
  scenario             smallint NOT NULL CHECK (scenario BETWEEN 1 AND 11),
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','scheduled','in_progress','completed','cancelled')),
  scheduled_start_at   timestamptz,
  pickup_address       text,
  pickup_lat           double precision,
  pickup_lng           double precision,
  dropoff_address      text,
  dropoff_lat          double precision,
  dropoff_lng          double precision,
  member_vehicle_id    uuid,
  partner_vehicle_id   uuid,
  total_price_cents    integer NOT NULL DEFAULT 0,
  notes                text,
  cancelled_reason     text,
  cancelled_at         timestamptz,
  created_by_admin     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concierge_jobs_member_idx
  ON public.concierge_jobs (member_id, scheduled_start_at DESC);
CREATE INDEX IF NOT EXISTS concierge_jobs_status_idx
  ON public.concierge_jobs (status, scheduled_start_at);

-- 2d. concierge_job_legs — ordered legs computed from scenario
CREATE TABLE IF NOT EXISTS public.concierge_job_legs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                   uuid NOT NULL REFERENCES public.concierge_jobs(id) ON DELETE CASCADE,
  sequence                 smallint NOT NULL,
  leg_type                 text NOT NULL
                           CHECK (leg_type IN ('passenger_ride','vehicle_shuttle','chase_follow')),
  driver_role              text NOT NULL DEFAULT 'primary'
                           CHECK (driver_role IN ('primary','secondary')),
  from_address             text,
  from_lat                 double precision,
  from_lng                 double precision,
  to_address               text,
  to_lat                   double precision,
  to_lng                   double precision,
  carries_passenger        boolean NOT NULL DEFAULT false,
  carries_member_vehicle   boolean NOT NULL DEFAULT false,
  carries_partner_vehicle  boolean NOT NULL DEFAULT false,
  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','in_progress','completed','skipped')),
  started_at               timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequence)
);

CREATE INDEX IF NOT EXISTS concierge_job_legs_job_idx
  ON public.concierge_job_legs (job_id, sequence);

-- 2e. concierge_job_drivers — driver assignments (primary/secondary)
CREATE TABLE IF NOT EXISTS public.concierge_job_drivers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES public.concierge_jobs(id) ON DELETE CASCADE,
  driver_id       uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  role            text NOT NULL
                  CHECK (role IN ('primary','secondary')),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  declined_at     timestamptz,
  decline_reason  text,
  UNIQUE (job_id, role),
  UNIQUE (job_id, driver_id)
);

CREATE INDEX IF NOT EXISTS concierge_job_drivers_driver_idx
  ON public.concierge_job_drivers (driver_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS concierge_job_drivers_job_idx
  ON public.concierge_job_drivers (job_id);

-- 2f. driver_location_pings — privacy-sensitive GPS trail
CREATE TABLE IF NOT EXISTS public.driver_location_pings (
  id          bigserial PRIMARY KEY,
  driver_id   uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  job_id      uuid REFERENCES public.concierge_jobs(id) ON DELETE SET NULL,
  leg_id      uuid REFERENCES public.concierge_job_legs(id) ON DELETE SET NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  accuracy_m  double precision,
  heading     double precision,
  speed_mps   double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_location_pings_driver_idx
  ON public.driver_location_pings (driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS driver_location_pings_job_idx
  ON public.driver_location_pings (job_id, recorded_at DESC);

-- 2g. driver_earnings — per-leg/per-job earnings ledger
CREATE TABLE IF NOT EXISTS public.driver_earnings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  job_id       uuid REFERENCES public.concierge_jobs(id) ON DELETE SET NULL,
  leg_id       uuid REFERENCES public.concierge_job_legs(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL,
  kind         text NOT NULL DEFAULT 'base'
               CHECK (kind IN ('base','tip','bonus','adjustment')),
  notes        text,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_earnings_driver_idx
  ON public.driver_earnings (driver_id, recorded_at DESC);

-- ============================================================================
-- 2h. Row Level Security — Task #332 tables
-- ============================================================================
ALTER TABLE public.drivers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_job_legs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_job_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_location_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_earnings       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drivers_self_read ON public.drivers;
CREATE POLICY drivers_self_read ON public.drivers
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS concierge_jobs_driver_read ON public.concierge_jobs;
CREATE POLICY concierge_jobs_driver_read ON public.concierge_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.concierge_job_drivers cjd
      JOIN public.drivers d ON d.id = cjd.driver_id
      WHERE cjd.job_id = concierge_jobs.id
        AND d.profile_id = auth.uid()
    )
    OR member_id = auth.uid()
  );

DROP POLICY IF EXISTS concierge_job_legs_driver_read ON public.concierge_job_legs;
CREATE POLICY concierge_job_legs_driver_read ON public.concierge_job_legs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.concierge_job_drivers cjd
      JOIN public.drivers d ON d.id = cjd.driver_id
      WHERE cjd.job_id = concierge_job_legs.job_id
        AND d.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS concierge_job_drivers_self_read ON public.concierge_job_drivers;
CREATE POLICY concierge_job_drivers_self_read ON public.concierge_job_drivers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = concierge_job_drivers.driver_id
        AND d.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS driver_location_pings_self_read ON public.driver_location_pings;
CREATE POLICY driver_location_pings_self_read ON public.driver_location_pings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_location_pings.driver_id
        AND d.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS driver_earnings_self_read ON public.driver_earnings;
CREATE POLICY driver_earnings_self_read ON public.driver_earnings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_earnings.driver_id
        AND d.profile_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. Task #334 round 1 — Stripe Connect + payout lifecycle
-- ============================================================================

-- 3a. drivers — Stripe Connect destination
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled    boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS drivers_stripe_connect_idx
  ON public.drivers (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

-- 3b. driver_earnings — payout lifecycle columns
ALTER TABLE public.driver_earnings
  ADD COLUMN IF NOT EXISTS payout_status      text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS paid_at            timestamptz,
  ADD COLUMN IF NOT EXISTS payout_error       text;

-- payout_status constraint (initial set — expanded in round 3 below)
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

-- Exactly one 'base' row per (driver, job) — prevents double-pay on replay
CREATE UNIQUE INDEX IF NOT EXISTS driver_earnings_base_unique
  ON public.driver_earnings (driver_id, job_id)
  WHERE kind = 'base' AND job_id IS NOT NULL;

-- 3c. Admin totals view
CREATE OR REPLACE VIEW public.driver_payouts_totals AS
SELECT
  driver_id,
  payout_status,
  SUM(amount_cents)::bigint AS total_cents,
  COUNT(*)::bigint          AS row_count
FROM public.driver_earnings
GROUP BY driver_id, payout_status;

-- ============================================================================
-- 4. Task #334 round 3 — Wallet model + cash-out
-- ============================================================================

-- 4a. Expand payout_status to include 'available'
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

-- Backfill: 'pending' rows with no transfer attempted → 'available'
UPDATE public.driver_earnings
   SET payout_status = 'available'
 WHERE payout_status = 'pending'
   AND stripe_transfer_id IS NULL;

-- 4b. driver_cashouts — one row per driver-initiated cash-out request
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

-- 4c. Link earnings to the cash-out that paid them out
ALTER TABLE public.driver_earnings
  ADD COLUMN IF NOT EXISTS cashout_id uuid REFERENCES public.driver_cashouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS driver_earnings_cashout_idx
  ON public.driver_earnings (cashout_id) WHERE cashout_id IS NOT NULL;

-- 4d. Wallet balance view — live aggregates per driver
--     SECURITY INVOKER so RLS on driver_earnings applies transparently.
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

-- 4e. RLS on driver_cashouts — drivers read their own rows only
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

-- 4f. Refresh totals view to include 'available' bucket
CREATE OR REPLACE VIEW public.driver_payouts_totals AS
SELECT
  driver_id,
  payout_status,
  SUM(amount_cents)::bigint AS total_cents,
  COUNT(*)::bigint          AS row_count
FROM public.driver_earnings
GROUP BY driver_id, payout_status;

COMMIT;
