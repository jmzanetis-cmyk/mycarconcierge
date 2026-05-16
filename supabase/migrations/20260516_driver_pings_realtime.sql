-- Task #447 — Live driver map over Realtime (no polling).
--
-- Adds public.driver_location_pings to the supabase_realtime publication so
-- the table's INSERTs CAN be observed by realtime clients that ARE allowed
-- to SELECT it (drivers reading their own pings, service-role admin tools).
--
-- IMPORTANT — members do NOT subscribe via postgres_changes:
--   The RLS policy `driver_location_pings_self_read` only lets the OWNING
--   driver (auth.uid() = drivers.profile_id) read pings. Supabase Realtime
--   enforces the same RLS on postgres_changes emissions, so a member with
--   their anon JWT cannot legally receive ping rows directly. The task
--   explicitly forbids relaxing that RLS, since the historical breadcrumb
--   trail is privacy-sensitive.
--
-- Instead, the server-side driver-api ping insert path also fires a
-- Realtime BROADCAST message on channel `concierge_job:<job_id>` after
-- every successful insert. Broadcast is a separate Realtime feature
-- (server-relayed pub/sub) that is NOT gated by table RLS — the member
-- subscribes to a channel whose name is a UUID they already legitimately
-- know (their active job_id) and which the server returned to them via
-- the existing GET /api/concierge/active-job-tracking endpoint. The
-- channel name is unguessable (random UUID), the payload carries only
-- the fields the HTTP endpoint already returns to that same member, and
-- the channel is torn down when the member's map widget unmounts.
--
-- Idempotent — DO block swallows duplicate_object so re-running on a
-- database that already has the table published is a no-op.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_location_pings;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL; -- publication missing — Supabase auto-creates it
  END;
END$$;
