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
-- RLS HARDENING — shipped in 20260428e_provider_writes_rls_lockdown.sql
-- (Task #132). That migration:
--   1. Drops the anon/authenticated INSERT policies on provider_applications
--      so all creates must flow through netlify/functions/provider-application.js.
--   2. Installs a column-scoped BEFORE UPDATE trigger on profiles that rejects
--      any non-service-role write to suspension_reason or suspended_at, forcing
--      all suspend/activate through netlify/functions/provider-admin.js. The
--      trigger approach was chosen over dropping "Admins can update any profile"
--      wholesale so the legacy admin.js writes for bid_credits and approval
--      role flips continue to work (those flows are out of scope for #132).
-- ============================================================================
