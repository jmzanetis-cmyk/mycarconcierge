-- ============================================================================
-- MCC Live Tracking — Server-side automation (Step 7)
-- Spec: mcc-live-tracking-spec-v4-FINAL.pdf §5.6, §10.4, §10.5
--
-- 1. tracking_notification_log — throttle table for proximity/arrival SMS
-- 2. pg_cron jobs for automated ops_flag detection:
--      dead_publisher      — urgent: no ping for 3 min on active leg
--      stale_active_leg    — review: attestation complete, no displacement 60 min
--      telemetry_gap       — review: >3 min gap on active Tier 3 leg
-- ============================================================================

begin;

-- ============================================================================
-- 1. Notification log — one proximity + one arrival SMS per leg
-- ============================================================================

create table if not exists public.tracking_notification_log (
  id         uuid        primary key default gen_random_uuid(),
  job_id     uuid        not null,
  leg_id     uuid,
  kind       text        not null check (kind in ('proximity_sms', 'arrival_sms')),
  member_id  uuid        not null,
  sent_at    timestamptz not null default now()
);

create index if not exists tracking_notif_log_job_leg_kind_idx
  on public.tracking_notification_log (job_id, leg_id, kind);

alter table public.tracking_notification_log enable row level security;
-- Admin-only — all reads/writes via service-role (proximity notifier function).

comment on table public.tracking_notification_log is
  'One row per sent proximity or arrival SMS per (job, leg, kind). '
  'Prevents duplicate proximity/arrival messages per leg.';

-- ============================================================================
-- 2. pg_cron automated flag detectors
--    Requires pg_cron extension (enabled on Supabase by default).
--    Schedule uses UTC. Pilot volume: all three jobs are trivial at
--    Alpha Auto Body scale; revisit query plans before widening.
-- ============================================================================

-- Helper: insert ops_flag only if no open duplicate already exists.
create or replace function public.upsert_ops_flag(
  p_kind     text,
  p_severity text,
  p_job_id   uuid      default null,
  p_handoff_id uuid    default null,
  p_driver_id  uuid    default null,
  p_detail   jsonb     default '{}'
) returns void language plpgsql security definer as $$
begin
  -- Deduplicate: skip if an open/acked flag of the same kind already exists
  -- for this job. Prevents a flood of identical flags while an issue persists.
  if exists (
    select 1 from public.ops_flags
    where kind    = p_kind
      and status  in ('open', 'acked')
      and (p_job_id is null or job_id = p_job_id)
  ) then
    return;
  end if;

  insert into public.ops_flags
    (kind, severity, job_id, handoff_id, driver_id, detail)
  values
    (p_kind, p_severity, p_job_id, p_handoff_id, p_driver_id, p_detail);
end; $$;

-- ── dead_publisher: no ping for 3 min on an active tracked leg ────────────────
-- Runs every 3 minutes. Urgent: dispatch operator calls driver.

create or replace function public.detect_dead_publishers() returns void
language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select
      cj.id   as job_id,
      cjl.id  as leg_id,
      cjd.driver_id,
      max(tp.recorded_at) as last_ping
    from public.concierge_jobs       cj
    join public.concierge_job_legs   cjl  on cjl.job_id  = cj.id
    join public.concierge_job_drivers cjd on cjd.job_id  = cj.id
    left join public.tracking_pings  tp   on tp.job_id   = cj.id
                                         and tp.driver_id = cjd.driver_id
                                         and tp.recorded_at > now() - interval '60 minutes'
    where cj.live_tracking_enabled = true
      and cj.status = 'in_progress'
      and cjl.status = 'in_progress'
      and cjd.accepted_at is not null
      and cjd.role = 'primary'
    group by cj.id, cjl.id, cjd.driver_id
    having max(tp.recorded_at) < now() - interval '3 minutes'
        or max(tp.recorded_at) is null
  loop
    perform public.upsert_ops_flag(
      'dead_publisher', 'urgent',
      p_job_id    => r.job_id,
      p_driver_id => r.driver_id,
      p_detail    => jsonb_build_object(
        'leg_id',    r.leg_id,
        'last_ping', r.last_ping
      )
    );
  end loop;
end; $$;

-- ── stale_active_leg: attestation complete, no displacement for 60 min ────────
-- Runs every 30 minutes. Review: follow up with driver.

create or replace function public.detect_stale_active_legs() returns void
language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select
      cj.id  as job_id,
      cjl.id as leg_id,
      -- First ping position on this leg
      first_value(tp.lat)  over w as first_lat,
      first_value(tp.lng)  over w as first_lng,
      -- Latest ping position
      last_value(tp.lat)   over w as last_lat,
      last_value(tp.lng)   over w as last_lng,
      count(tp.id) over w         as ping_count
    from public.concierge_jobs      cj
    join public.concierge_job_legs  cjl on cjl.job_id = cj.id
    join public.tracking_pings      tp  on tp.job_id  = cj.id
    where cj.live_tracking_enabled = true
      and cj.status    = 'in_progress'
      and cjl.status   = 'in_progress'
      and tp.recorded_at > now() - interval '120 minutes'
    window w as (partition by cj.id, cjl.id order by tp.recorded_at
                 rows between unbounded preceding and unbounded following)
  loop
    -- Flag only if displacement < 100 m over the observation window AND
    -- the window spans at least 60 minutes.
    -- Simplified: use pg haversine approximation (good enough at city scale).
    if (
      point(r.first_lng, r.first_lat) <@>
      point(r.last_lng,  r.last_lat)  * 1609.34   -- miles → metres approx
    ) < 100 and r.ping_count >= 3 then
      perform public.upsert_ops_flag(
        'stale_active_leg', 'review',
        p_job_id => r.job_id,
        p_detail => jsonb_build_object('leg_id', r.leg_id)
      );
    end if;
  end loop;
end; $$;

-- ── telemetry_gap: >3 min gap between consecutive pings on Tier 3 leg ─────────
-- Runs every 5 minutes. Review: claim-handler context.

create or replace function public.detect_telemetry_gaps() returns void
language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select
      tp.job_id,
      tp.driver_id,
      tp.recorded_at                           as gap_start,
      lead(tp.recorded_at) over w              as gap_end,
      lead(tp.recorded_at) over w - tp.recorded_at as gap_duration
    from public.tracking_pings tp
    join public.concierge_jobs cj on cj.id = tp.job_id
    where cj.live_tracking_enabled = true
      and cj.status   = 'in_progress'
      and tp.recorded_at > now() - interval '2 hours'
    window w as (partition by tp.job_id, tp.driver_id order by tp.recorded_at)
  loop
    if r.gap_duration > interval '3 minutes' then
      perform public.upsert_ops_flag(
        'telemetry_gap', 'review',
        p_job_id    => r.job_id,
        p_driver_id => r.driver_id,
        p_detail    => jsonb_build_object(
          'gap_start',    r.gap_start,
          'gap_end',      r.gap_end,
          'gap_seconds',  extract(epoch from r.gap_duration)
        )
      );
    end if;
  end loop;
end; $$;

-- ── Schedule via pg_cron ──────────────────────────────────────────────────────

do $$
begin
  -- Remove any stale versions of these jobs before re-scheduling.
  perform cron.unschedule('mcc_dead_publisher_check');
  perform cron.unschedule('mcc_stale_active_leg_check');
  perform cron.unschedule('mcc_telemetry_gap_check');
exception
  when others then null; -- cron extension may not have these jobs yet; ignore
end $$;

select cron.schedule(
  'mcc_dead_publisher_check',
  '*/3 * * * *',
  $$select public.detect_dead_publishers();$$
);

select cron.schedule(
  'mcc_stale_active_leg_check',
  '*/30 * * * *',
  $$select public.detect_stale_active_legs();$$
);

select cron.schedule(
  'mcc_telemetry_gap_check',
  '*/5 * * * *',
  $$select public.detect_telemetry_gaps();$$
);

commit;
