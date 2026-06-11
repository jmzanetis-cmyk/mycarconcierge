-- ============================================================================
-- MCC Live Tracking — single migration
-- Spec: mcc-live-tracking-spec-v4-FINAL.pdf
--
-- Step 0 adaptations applied:
--   • No insurance_policies table → live_tracking_enabled boolean on
--     concierge_jobs is the v1 insurance/feature gate.
--   • No scan_exception_reason pattern → device_failure lands in ops_flags.kind.
--   • No Realtime Authorization (realtime.messages RLS not enabled on this
--     project) → channel-name-as-secret (unguessable job UUID) is the access
--     control model, consistent with the existing broadcast pattern.
--   • handoff_leg enum already contains all needed values; no new value added.
--   • tracking_pings is a new table (does not alter driver_location_pings,
--     which has a driver-only RLS posture incompatible with member/provider
--     reads needed here).
-- ============================================================================

begin;

-- ============================================================================
-- 1. Feature / insurance gate on concierge_jobs
-- ============================================================================
-- Set by admin/dispatch at job creation once insurance is confirmed active.
-- Tracking publisher and viewer both gate on this flag. Gate inactive →
-- custody proceeds as today; tracking stays inert and member sees status cards.
-- Never flip this on for a job with no active insurance — see spec §3.7.

alter table public.concierge_jobs
  add column if not exists live_tracking_enabled boolean not null default false;

comment on column public.concierge_jobs.live_tracking_enabled is
  'Insurance + feature gate for live GPS tracking on this job. Set true only '
  'once transport insurance is confirmed active for the provider. Tracking '
  'publisher and all viewer surfaces check this flag before activating. '
  'Custody photos/attestations proceed regardless.';

-- ============================================================================
-- 2. tracking_pings — append-only GPS evidence trail
-- ============================================================================
-- Separate from driver_location_pings (which has driver-only RLS and lacks
-- subject/role/evidence columns). This table is readable by all job parties.

create table if not exists public.tracking_pings (
  id             bigint generated always as identity primary key,

  -- Context — at least one of job_id or ride_id must be non-null (see constraint)
  job_id         uuid references public.concierge_jobs(id) on delete set null,
  ride_id        uuid,                            -- FK per real rides schema
  handoff_id     uuid,                            -- FK per real custody schema

  -- Publisher identity
  driver_id      uuid not null,                  -- auth.uid() of publishing driver
  subject        text not null
                 check (subject in ('driver_vehicle', 'member_vehicle')),
  driver_role    text not null default 'primary'
                 check (driver_role in ('primary', 'chase')),

  -- Leg context (real enum value from concierge_job_legs.leg_type or
  -- handoff_leg; stored as text so both schemas can contribute)
  leg            text,
  event_kind     text not null default 'leg'
                 check (event_kind in ('leg', 'road_test', 'tow')),

  -- Position
  lat            double precision not null,
  lng            double precision not null,
  heading        real,
  speed          real,                            -- m/s, raw GPS
  speed_smoothed real,                            -- m/s, 3-ping rolling average
  accuracy       real,                            -- metres; publisher drops >50 m fixes

  -- Device state
  low_power      boolean not null default false,  -- iOS LPM / Android battery saver
  mock           boolean not null default false,  -- Android isFromMockProvider

  -- Timestamps — device_ts is informational only; recorded_at is authoritative
  device_ts      timestamptz,
  recorded_at    timestamptz not null default now(),

  constraint job_or_ride check (job_id is not null or ride_id is not null)
);

create index if not exists tracking_pings_job_idx
  on public.tracking_pings (job_id, recorded_at desc);
create index if not exists tracking_pings_ride_idx
  on public.tracking_pings (ride_id, recorded_at desc);
create index if not exists tracking_pings_handoff_idx
  on public.tracking_pings (handoff_id, recorded_at desc);

alter table public.tracking_pings enable row level security;

-- Immutability: no UPDATE or DELETE ever — same pattern as custody tables
create or replace function public.tracking_pings_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'tracking_pings is append-only; rows may never be updated or deleted.';
end; $$;

create trigger tracking_pings_immutable
  before update or delete on public.tracking_pings
  for each row execute function public.tracking_pings_block_mutation();

-- RLS: driver inserts their own pings while a party to the job/ride.
-- Any job party (member, provider, driver) may read.
create policy "tp_insert" on public.tracking_pings
  for insert
  with check (
    driver_id = auth.uid()
    and (
      job_id is null
      or is_job_party(job_id, auth.uid())
    )
  );

create policy "tp_select" on public.tracking_pings
  for select
  using (
    job_id is not null and is_job_party(job_id, auth.uid())
  );

-- ============================================================================
-- 3. custody_hold_events — parked custody snapshots
-- ============================================================================
-- Driver taps Secure Hold → hold_start row → publisher stops → GPS off.
-- Resume → hold_end row → publisher restarts.
-- Member display uses COARSE location only (reverse-geocoded city/neighbourhood).
-- Precise coordinates stay in audit record and are NEVER returned to members.

create table if not exists public.custody_hold_events (
  id          uuid primary key default gen_random_uuid(),
  handoff_id  uuid not null,                     -- FK per real schema
  driver_id   uuid not null,
  kind        text not null check (kind in ('hold_start', 'hold_end')),
  lat         double precision not null,
  lng         double precision not null,
  accuracy    real,
  photo_path  text,                               -- live-camera snapshot via existing capture pipeline
  created_at  timestamptz not null default now()
);

alter table public.custody_hold_events enable row level security;

create trigger custody_hold_events_immutable
  before update or delete on public.custody_hold_events
  for each row execute function public.block_mutation();

create policy "che_insert" on public.custody_hold_events
  for insert
  with check (
    driver_id = auth.uid()
    and is_job_party(
      (select job_id from public.custody_handoffs where id = handoff_id limit 1),
      auth.uid()
    )
  );

create policy "che_select" on public.custody_hold_events
  for select
  using (
    is_job_party(
      (select job_id from public.custody_handoffs where id = handoff_id limit 1),
      auth.uid()
    )
  );

-- ============================================================================
-- 4. road_test_events — provider opt-in road test tracking
-- ============================================================================
-- Provider starts/stops from their surface. While active the provider device
-- MAY publish on the job channel with event_kind:'road_test'.
-- Distance can derive from start/end odometer or from pings (both stored).

create table if not exists public.road_test_events (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.concierge_jobs(id) on delete cascade,
  provider_id      uuid not null,
  started_by       uuid not null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  start_odometer   numeric,
  end_odometer     numeric,
  distance_mi      numeric
);

alter table public.road_test_events enable row level security;

create policy "rte_insert" on public.road_test_events
  for insert
  with check (
    started_by = auth.uid()
    and is_job_party(job_id, auth.uid())
  );

create policy "rte_select" on public.road_test_events
  for select
  using (is_job_party(job_id, auth.uid()));

-- ============================================================================
-- 5. dispute_holds — freeze tracking evidence for disputed windows
-- ============================================================================
-- Created when a handoff enters disputed status. The held window is excluded
-- from any future retention purge. Retention decision must be made together
-- with the custody-photo retention window (both are still open as of v4 spec).

create table if not exists public.dispute_holds (
  id           uuid primary key default gen_random_uuid(),
  handoff_id   uuid not null,                    -- FK per real schema
  window_start timestamptz not null,
  window_end   timestamptz,                       -- null = open-ended until resolved
  created_at   timestamptz not null default now()
);

alter table public.dispute_holds enable row level security;

-- Admin-only write (service-role); job parties may read their own hold records
create policy "dh_select" on public.dispute_holds
  for select
  using (
    is_job_party(
      (select job_id from public.custody_handoffs where id = handoff_id limit 1),
      auth.uid()
    )
  );

-- ============================================================================
-- 6. attestation co-location columns
-- ============================================================================
-- Capture attesting device GPS at every release/accept/dispute submission.
-- Compute party_separation_m when both sides have fixes.
-- Record, never gate (GPS noise). Tier 3 + separation >500 m → ops flag.

alter table public.custody_attestations
  add column if not exists attest_lat          double precision,
  add column if not exists attest_lng          double precision,
  add column if not exists attest_accuracy_m   real,
  add column if not exists party_separation_m  real;

comment on column public.custody_attestations.party_separation_m is
  'Distance in metres between releasing and receiving party GPS fixes at '
  'attestation time. Null when either side has no fix. Never used as a gate — '
  'GPS noise makes it informational only. Tier 3 legs with >500 m separation '
  'generate an attestation_separation ops flag for claim-handler context.';

-- ============================================================================
-- 7. ops_flags — automated detection runbook data layer
-- ============================================================================
-- All automated detections write here. Flags are reviewable context,
-- never auto-penalties. Admin-only write (via service-role); admin-only read.
-- Spec §10.5 runbook and severity table implemented via kind + severity columns.

create table if not exists public.ops_flags (
  id              uuid primary key default gen_random_uuid(),

  -- Flag classification
  kind            text not null check (kind in (
    'telemetry_gap',            -- >3 min ping gap on active Tier 3 leg
    'mock_location',            -- Android isFromMockProvider on custody leg
    'attestation_separation',   -- party_separation_m >500 m on Tier 3 leg
    'stale_active_leg',         -- attestation complete, no displacement for 60 min
    'movement_before_attestation', -- >200 m movement before attestation complete
    'speed_threshold',          -- smoothed speed >85 mph or >50 mph on surface streets sustained >60 s
    'tandem_separation',        -- lead/chase >~2 km apart for >2 min
    'dead_publisher',           -- no ping for 3 min on active leg
    'low_power_degraded',       -- cadence degraded >2× expected due to low power mode
    'device_failure'            -- publisher died mid-leg; no queued pings will flush
  )),
  severity        text not null check (severity in ('info', 'review', 'urgent')),
  status          text not null default 'open'
                  check (status in ('open', 'acked', 'resolved', 'dismissed')),

  -- Context references (nullable — set whichever apply)
  job_id          uuid,
  ride_id         uuid,
  handoff_id      uuid,
  driver_id       uuid,

  -- Detail payload for runbook context
  detail          jsonb not null default '{}',

  -- Lifecycle
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid,
  resolution_note text
);

create index if not exists ops_flags_triage_idx
  on public.ops_flags (status, severity, created_at desc);
create index if not exists ops_flags_job_idx
  on public.ops_flags (job_id, created_at desc);
create index if not exists ops_flags_driver_idx
  on public.ops_flags (driver_id, created_at desc);

alter table public.ops_flags enable row level security;
-- No client-side RLS policies — all reads/writes via service-role only.
-- Admin queue UI uses the existing Bearer-JWT admin auth posture (requireAdminAuth).

-- ============================================================================
-- 8. Realtime publication
-- ============================================================================
-- tracking_pings published so job parties can receive live position updates
-- via postgres_changes (subject to their RLS SELECT policy above).
-- Broadcast on channel track:job:{job_id} remains the primary live-update
-- path (lower latency, no table-scan on every insert); postgres_changes
-- is the reconnect-seed fallback per spec §5.1.

do $$
begin
  begin
    alter publication supabase_realtime add table public.tracking_pings;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.custody_hold_events;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end$$;

commit;

-- ============================================================================
-- POST-MIGRATION NOTES (not code — for Jordan + ops)
-- ============================================================================
--
-- CHANNEL SECURITY MODEL (no realtime.messages RLS on this project):
--   Channel names track:job:{job_id} and track:ride:{ride_id} use the job/ride
--   UUID as an unguessable secret. Consistent with the existing broadcast
--   pattern in 20260516_driver_pings_realtime.sql. Server only tells a client
--   its own job UUID after auth + is_job_party() check.
--
-- RETENTION / IMMUTABILITY TENSION (still open — decide with custody photos):
--   tracking_pings and dispute_holds must align retention window with
--   custody_photos (photo retention decision still pending from capture spec).
--   GDPR/CCPA deletion requests for tracking data require evidence-hold
--   carve-out language — see spec §10.6 item 4.
--
-- SMS OPT-IN (needed before wiring §5.6 proximity SMS):
--   Confirm the sms_opt_in column name in the members/profiles table before
--   the proximity-SMS Twilio function is written (Step 7 of build order).
--
-- live_tracking_enabled BACKFILL:
--   Existing concierge_jobs rows default to false (safe — no surprise tracking
--   activations). Set true per-job in the admin dispatch UI once insurance is
--   confirmed for the provider. Alpha Auto Body pilot: flip manually.
-- ============================================================================
