-- ============================================================================
-- Task #332 — Driver app backend foundation
--
-- Adds the schema that backs the separate "MCC Driver" Replit project:
--
--   drivers                — 1:1 with profiles, tracks active driver roster.
--   concierge_jobs         — top-level booking (tier 1-4, scenario 1-11).
--   concierge_job_legs     — ordered legs computed from scenario.
--   concierge_job_drivers  — driver assignments (primary/secondary).
--   driver_location_pings  — privacy-sensitive GPS trail (driver+admin only).
--   driver_earnings        — per-leg/per-job earnings ledger.
--
-- The driver service catalog is richer than simple pickup/dropoff. There are
-- four tiers and eleven canonical scenarios. The server expands `legs` from
-- the scenario number on job creation; clients NEVER invent legs.
--
-- TIERS
--   T1 Passenger Rides       — 1 driver, 1 vehicle (MCC's), member rides.
--   T2 Vehicle Shuttle Solo  — 1 driver, 0 partner vehicles, member's car.
--   T3 Vehicle Shuttle Paired — 2 drivers, 1 chase vehicle, member's car.
--   T4 Full Concierge        — 2 drivers, 1 partner vehicle, both car + member.
--
-- SCENARIO → LEG EXPANSION (source of truth — keep in sync with
-- netlify/functions/concierge-jobs-admin.js EXPAND_SCENARIO and
-- docs/driver-app-api.md):
--
--   S1  T1 drop-off ride          : [passenger_ride home→provider]
--   S2  T1 pick-up ride           : [passenger_ride provider→home]
--   S3  T1 round-trip ride        : [passenger_ride home→provider,
--                                    passenger_ride provider→home]
--   S4  T2 vehicle drop solo      : [vehicle_shuttle home→provider]
--   S5  T2 vehicle pickup solo    : [vehicle_shuttle provider→home]
--   S6  T2 vehicle round-trip solo: [vehicle_shuttle home→provider,
--                                    vehicle_shuttle provider→home]
--   S7  T3 paired drop            : [vehicle_shuttle home→provider (A, member car),
--                                    chase_follow   home→provider (B, partner),
--                                    chase_follow   provider→home (both, partner)]
--   S8  T3 paired pickup          : [chase_follow   home→provider (B, partner),
--                                    vehicle_shuttle provider→home (A, member car),
--                                    chase_follow   provider→home (B, partner)]
--   S9  T4 concierge drop         : [vehicle_shuttle home→provider (A, member car),
--                                    passenger_ride  home→provider (B, partner, member rides)]
--   S10 T4 concierge pickup       : [vehicle_shuttle provider→home (A, member car),
--                                    passenger_ride  provider→home (B, partner, member rides)]
--   S11 T4 concierge round-trip   : S9 legs + S10 legs in order
--
-- RLS PHILOSOPHY
--   - Drivers read ONLY rows tied to their own driver_id.
--   - driver_location_pings: drivers read their own + admins via service-role.
--     Member-side visibility is intentionally NOT exposed here — it must go
--     through a future throttled "active job tracking" view (follow-up).
--   - Admin writes (job creation/assignment/cancellation) flow through the
--     service-role Netlify functions and bypass RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. drivers — pre-vetted MCC drivers (employees/contractors). Separate from
--    `fleets` / `fleet_members` (those model B2B fleet customers). Reusing
--    them would create RLS ambiguity, so this is intentionally a new table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drivers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id         uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name          text NOT NULL,
  phone              text NOT NULL UNIQUE,            -- E.164, used for OTP login
  email              text NOT NULL,                  -- required: backs Supabase auth user for token minting
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','offboarded')),
  vehicle_class      text[] NOT NULL DEFAULT ARRAY['sedan']::text[],
                     -- e.g. {sedan, suv, manual_transmission, large_cargo}
  hourly_rate_cents  integer NOT NULL DEFAULT 0,
  per_job_rate_cents integer NOT NULL DEFAULT 0,
  onboarded_at       timestamptz,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drivers_phone_idx  ON public.drivers (phone);
CREATE INDEX IF NOT EXISTS drivers_status_idx ON public.drivers (status);
-- (driver_id, status) composite — supports the common authenticate-then-
-- check-active path (drivers WHERE id = X AND status = 'active') without
-- a heap visit for the status column.
CREATE INDEX IF NOT EXISTS drivers_id_status_idx ON public.drivers (id, status);

-- ---------------------------------------------------------------------------
-- 1b. driver_otp_send_log — persistent rate-limit audit trail for the
-- send-code endpoint. Survives function cold starts and is shared across
-- horizontally-scaled Netlify instances (in-memory limiters are bypassable
-- under load). Pruned by a daily cleanup or a TTL job; rows older than
-- 1 day are not consulted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_otp_send_log (
  id      bigserial PRIMARY KEY,
  phone   text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_otp_send_log_phone_sent_idx
  ON public.driver_otp_send_log (phone, sent_at DESC);
ALTER TABLE public.driver_otp_send_log ENABLE ROW LEVEL SECURITY;
-- Service-role only. No driver/member ever reads this table.

-- ---------------------------------------------------------------------------
-- 2. concierge_jobs — top-level booking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  appointment_id       uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
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

-- ---------------------------------------------------------------------------
-- 3. concierge_job_legs — ordered legs computed from scenario
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_job_legs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                   uuid NOT NULL REFERENCES public.concierge_jobs(id) ON DELETE CASCADE,
  sequence                 smallint NOT NULL,           -- 1-based
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

-- ---------------------------------------------------------------------------
-- 4. concierge_job_drivers — driver assignments (primary/secondary)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5. driver_location_pings — privacy-sensitive GPS trail
--    Append-only. RLS restricts reads to the driver who created the ping
--    plus admin (service-role).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_location_pings (
  id            bigserial PRIMARY KEY,
  driver_id     uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  job_id        uuid REFERENCES public.concierge_jobs(id) ON DELETE SET NULL,
  leg_id        uuid REFERENCES public.concierge_job_legs(id) ON DELETE SET NULL,
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  accuracy_m    double precision,
  heading       double precision,
  speed_mps     double precision,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_location_pings_driver_idx
  ON public.driver_location_pings (driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS driver_location_pings_job_idx
  ON public.driver_location_pings (job_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- 6. driver_earnings — per-leg or per-job earnings ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_earnings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  job_id        uuid REFERENCES public.concierge_jobs(id) ON DELETE SET NULL,
  leg_id        uuid REFERENCES public.concierge_job_legs(id) ON DELETE SET NULL,
  amount_cents  integer NOT NULL,
  kind          text NOT NULL DEFAULT 'base'
                CHECK (kind IN ('base','tip','bonus','adjustment')),
  notes         text,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_earnings_driver_idx
  ON public.driver_earnings (driver_id, recorded_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.drivers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_job_legs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_job_drivers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_location_pings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_earnings        ENABLE ROW LEVEL SECURITY;

-- Drivers can read their own driver row (matched via profile_id = auth.uid()).
DROP POLICY IF EXISTS drivers_self_read ON public.drivers;
CREATE POLICY drivers_self_read ON public.drivers
  FOR SELECT USING (profile_id = auth.uid());

-- Concierge jobs: a driver sees a job only if they're assigned to it.
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

-- Legs: same predicate as the parent job.
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

-- Driver assignments: a driver can read their own assignment rows.
DROP POLICY IF EXISTS concierge_job_drivers_self_read ON public.concierge_job_drivers;
CREATE POLICY concierge_job_drivers_self_read ON public.concierge_job_drivers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = concierge_job_drivers.driver_id
        AND d.profile_id = auth.uid()
    )
  );

-- Pings: drivers read ONLY their own. (Admins use service-role and bypass RLS.)
DROP POLICY IF EXISTS driver_location_pings_self_read ON public.driver_location_pings;
CREATE POLICY driver_location_pings_self_read ON public.driver_location_pings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_location_pings.driver_id
        AND d.profile_id = auth.uid()
    )
  );

-- Earnings: drivers read ONLY their own.
DROP POLICY IF EXISTS driver_earnings_self_read ON public.driver_earnings;
CREATE POLICY driver_earnings_self_read ON public.driver_earnings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_earnings.driver_id
        AND d.profile_id = auth.uid()
    )
  );

-- NOTE: no INSERT / UPDATE / DELETE policies are added. Every write flows
-- through netlify/functions/driver-api.js or netlify/functions/
-- concierge-jobs-admin.js, both of which use the service-role client.
