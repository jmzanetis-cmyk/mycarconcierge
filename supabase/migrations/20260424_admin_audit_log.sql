-- ============================================================================
-- admin_audit_log: tamper-evident record of privilege-sensitive admin actions.
--
-- Created for Task #131 (was #127) when provider suspend/activate and
-- provider application creation moved off the browser onto server-side Netlify
-- functions. Every privileged action now leaves an audit row here so we can
-- answer "who suspended X provider, when, and why" months after the fact.
--
-- Action taxonomy (extend as new admin endpoints land):
--   'suspend_provider'    | suspended a provider account
--   'activate_provider'   | un-suspended a provider account
--   'check_low_rated'     | queried for low-rated providers (preview only)
--   'autosuspend_low_rated' | bulk-suspended low-rated providers
--   'create_provider_application' | server-side provider_application insert
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id            bigserial PRIMARY KEY,
  action        text NOT NULL,
  target_id     uuid,
  target_type   text,
  reason        text,
  metadata      jsonb DEFAULT '{}'::jsonb,
  performed_by  text NOT NULL DEFAULT 'admin',
  performed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON public.admin_audit_log (target_type, target_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx
  ON public.admin_audit_log (action, performed_at DESC);

-- ============================================================================
-- RLS HARDENING — apply AFTER one clean rollout cycle has confirmed the new
-- server-side endpoints are working in production. Until then, the existing
-- RLS policies must remain in place so the old browser code keeps working
-- during the rollout window.
--
-- To apply, paste the statements below (un-commented) into the Supabase SQL
-- Editor:
--
--   -- 1. Block direct inserts into provider_applications from anon/authenticated
--   --    (forces all creates through netlify/functions/provider-application.js):
--   DROP POLICY IF EXISTS "Users can create their own application" ON public.provider_applications;
--   DROP POLICY IF EXISTS "Users insert own provider_applications" ON public.provider_applications;
--   -- (Service role bypasses RLS entirely, so no replacement insert policy is needed.)
--
--   -- 2. Block direct updates to suspension_reason / suspended_at on profiles
--   --    (forces all suspend/activate through netlify/functions/provider-admin.js).
--   --    Postgres has no native column-level WITH CHECK, so the cleanest pattern is
--   --    to deny non-service-role updates entirely on profiles and rely on the
--   --    existing server endpoints for any admin-driven changes:
--   DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
--   -- (Keep "Users can update own profile" as-is — that policy already excludes
--   --  suspension_reason via the WITH CHECK clause if it was authored correctly.
--   --  Audit it before applying this DROP.)
-- ============================================================================
