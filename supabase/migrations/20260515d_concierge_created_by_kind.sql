-- ============================================================================
-- Task #369 — Concierge driver coordination for members and providers
--
-- Adds source-tracking columns to concierge_jobs so admins (and the audit
-- trail) can tell apart admin-created jobs from member- or provider-
-- initiated requests now that those flows exist.
--
--   created_by_kind  — 'admin' | 'member' | 'provider' | 'system'
--   created_by_id    — auth.users.id of the requesting user (NULL for admin
--                      / system since admin auth is shared password-based).
--
-- The legacy `created_by_admin` column stays for backward compatibility; new
-- writes populate both. created_by_kind defaults to 'admin' so existing rows
-- attribute correctly without a backfill query.
-- ============================================================================

ALTER TABLE public.concierge_jobs
  ADD COLUMN IF NOT EXISTS created_by_kind text NOT NULL DEFAULT 'admin'
    CHECK (created_by_kind IN ('admin','member','provider','system')),
  ADD COLUMN IF NOT EXISTS created_by_id   uuid;

CREATE INDEX IF NOT EXISTS concierge_jobs_created_by_idx
  ON public.concierge_jobs (created_by_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS concierge_jobs_appointment_idx
  ON public.concierge_jobs (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS concierge_jobs_provider_idx
  ON public.concierge_jobs (provider_id, scheduled_start_at DESC)
  WHERE provider_id IS NOT NULL;
