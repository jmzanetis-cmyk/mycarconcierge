-- ============================================================
-- MCC Live Tracking — Step 8 Demo Mode
-- Adds is_demo flag to concierge_jobs.
-- ============================================================

ALTER TABLE public.concierge_jobs
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.concierge_jobs.is_demo IS
  'True for seeded demo / App Review jobs. Members and providers see a DEMO watermark; pings are safe to discard from production analytics.';
