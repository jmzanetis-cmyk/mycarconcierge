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
--   'approve_provider_application' | admin approved a provider application
--   'reject_provider_application'  | admin rejected a provider application
--   'request_application_info'     | admin asked the applicant for more info
--   'adjust_bid_credits'  | admin granted/deducted bid credits via the
--                          /api/admin/provider-actions/adjust-credits endpoint
--                          (metadata: { before, after, delta })
--   'update_apollo_config'   | admin saved Apollo discovery settings via
--                              PUT /api/admin/apollo/config (Task #143/#274).
--                              metadata.updates: object of changed keys (e.g.
--                              { enabled: true, interval_hours: 6 }). Toggling
--                              `enabled` true/false is the canonical "Apollo
--                              turned on/off" event.
--   'apollo_run_now'         | admin clicked "Run now" on the Apollo
--                              dashboard tab — POST /api/admin/apollo/run-now
--                              (Task #143/#274). Logged BEFORE the cycle so
--                              even crashes leave a breadcrumb. metadata:
--                              { triggered_at }.
--   'apollo_manual_search'   | admin executed a manual Apollo search from
--                              the dashboard. metadata: { found, with_email,
--                              page, per_page }.
--   'apollo_manual_enrich'   | admin triggered a manual enrichment pass.
--                              metadata: { total, enriched, failed }.
--   'create_concierge_job'   | admin created a concierge job via
--                              POST /api/admin/concierge-jobs (Task #332).
--                              metadata: { tier, scenario, member_id, leg_count }.
--   'assign_concierge_driver'| admin assigned a driver to a concierge job.
--                              metadata: { driver_id, role }.
--   'cancel_concierge_job'   | admin cancelled a concierge job.
--                              reason: free-text.
-- The Apollo dashboard tab in admin.html (Task #275) renders these four
-- actions with friendly labels via the "Recent Apollo Admin Actions" card,
-- backed by GET /api/admin/apollo/audit-log.
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
