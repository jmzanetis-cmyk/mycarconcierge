-- Task #284 — Members get a real-time toast + Care Plans badge update
-- when a provider posts a new bid. The client subscription in
-- www/members-care-plans.js listens for INSERTs on public.plan_bids via
-- Supabase Realtime, which only emits change events for tables that have
-- been added to the supabase_realtime publication.
--
-- The matching `notifications` row inserted server-side (POST
-- /api/plan-bids in www/server.js) feeds the global notifications bell
-- via members-core.js, so notifications must also be in the publication.
-- Adding both is idempotent — DO blocks swallow the duplicate-object
-- error so re-running this migration on a database that already had
-- either table published is a no-op.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_bids;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL; -- publication itself missing — Supabase auto-creates it
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END$$;
