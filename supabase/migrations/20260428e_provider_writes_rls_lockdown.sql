-- ============================================================================
-- Task #132 — Lock down direct database writes for provider suspend &
-- application creation.
--
-- Task #131 moved both flows onto server-side Netlify functions
-- (netlify/functions/provider-application.js and
-- netlify/functions/provider-admin.js, both of which use the service-role
-- Supabase client). With one clean production deploy cycle behind us, this
-- migration removes the safety-net RLS that still allowed the legacy browser
-- code to write directly, so the database itself rejects any bypass attempt.
--
-- Two changes:
--
--   1. provider_applications: drop the policies that allowed anon /
--      authenticated callers to INSERT. Service role bypasses RLS so the
--      provider-application endpoint keeps working.
--
--   2. profiles: install a BEFORE UPDATE trigger that, for any non-service-role
--      caller, raises an exception when the request tries to change
--      suspension_reason or suspended_at. We use a column-scoped trigger
--      instead of dropping "Admins can update any profile" wholesale because
--      admin.js still does legitimate browser-side profile updates for
--      bid_credits and approval role flips that are out of scope for this
--      hardening pass. A trigger is the cleanest way to enforce column-level
--      "service-role only" semantics in Postgres.
--
-- Pattern for the trigger function mirrors restrict_provider_alerts_dismiss_only
-- shipped in 20260422_bgc_notifications_alerts.sql.
-- ============================================================================

-- 1. Block direct INSERTs into provider_applications from the browser.
--    All legitimate creates now flow through netlify/functions/provider-application.js,
--    which authenticates the JWT, validates the payload, rate-limits, and
--    inserts via service-role (bypassing RLS). The two policy names cover
--    both historical naming conventions; IF EXISTS makes the migration safe
--    to apply against environments where only one was ever installed.
DROP POLICY IF EXISTS "Users can create their own application" ON public.provider_applications;
DROP POLICY IF EXISTS "Users insert own provider_applications" ON public.provider_applications;

-- 2. Block direct browser UPDATEs to suspension_reason / suspended_at on profiles.
--    All legitimate suspend/activate now flows through
--    netlify/functions/provider-admin.js, which uses the service-role client
--    (auth.role() = 'service_role') and so is allowed through.
CREATE OR REPLACE FUNCTION public.restrict_profile_suspension_writes()
RETURNS trigger AS $$
BEGIN
  -- Allow callers whose JWT role is service_role (i.e. the provider-admin
  -- Netlify function using SUPABASE_SERVICE_ROLE_KEY).
  --
  -- OPERATOR NOTE: auth.role() reads from the request's JWT claims. Sessions
  -- without a JWT (the Supabase SQL Editor, psql/superuser, pg_cron jobs, or
  -- one-off scripts using the postgres role) will see auth.role() = NULL, so
  -- this trigger will REJECT their attempts to change suspension_reason /
  -- suspended_at. That is intentional — every legitimate write must come from
  -- the provider-admin endpoint so we get the audit row + email + notification
  -- side effects. If you need to fix data manually, do it through the
  -- endpoint or temporarily disable the trigger
  -- (ALTER TABLE public.profiles DISABLE TRIGGER trg_restrict_profile_suspension_writes).
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For everyone else, reject any attempt to modify the suspension columns.
  -- IS DISTINCT FROM correctly handles NULL transitions in either direction.
  IF NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    RAISE EXCEPTION 'profiles.suspension_reason can only be modified via the provider-admin server endpoint'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
    RAISE EXCEPTION 'profiles.suspended_at can only be modified via the provider-admin server endpoint'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_restrict_profile_suspension_writes ON public.profiles;
CREATE TRIGGER trg_restrict_profile_suspension_writes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.restrict_profile_suspension_writes();
