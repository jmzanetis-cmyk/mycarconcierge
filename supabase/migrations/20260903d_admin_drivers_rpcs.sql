-- ============================================================================
-- 20260903d — admin_list_drivers / admin_approve_driver / admin_set_driver_status
--
-- Fixes Driver Applications / Active Drivers: the `drivers` table has exactly
-- one RLS policy (drivers_self_read — a driver reading their own row) and no
-- admin policy at all, so every admin read of this table came back empty
-- (BGC status always showed "not started", the Active Drivers roster always
-- showed "No approved drivers yet") and every admin write silently affected
-- zero rows (Suspend/Reactivate did nothing).
--
-- Jordan's call on the design (2026-09-03, admin-portal audit Tier 3): admins
-- get access to this table ONLY through purpose-built RPCs, never a broad
-- table policy — this is driver PII (license/BGC data), and admins should
-- only ever be able to move a driver through its approve/reject/suspend/
-- reactivate lifecycle, not arbitrarily rewrite any field (pay rate, vehicle
-- class, Stripe account, etc). Reads return the full row (the existing admin
-- UI already displays contact info, ratings, Stripe status, etc. — narrowing
-- reads would break working functionality for no security benefit, since
-- these are exactly the fields the admin UI is supposed to show); writes are
-- narrowly scoped to status transitions only.
--
-- Bonus find while wiring this up: www/admin.js's approveDriver() and
-- rejectDriver() also write directly to profiles.role via the browser
-- client — but the "Admins can update any profile" RLS policy that made
-- that work was deliberately dropped in 20260515c (Task #240), which moved
-- privileged profile writes to netlify/functions/provider-admin.js's
-- update-user-role route instead. Driver approve/reject were never migrated
-- along with the rest, so those role flips have been silently no-op'ing too.
-- Fixed alongside this migration by extending update-user-role's role
-- whitelist to include 'driver' and 'rejected_driver' (see provider-admin.js).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_drivers_caller_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_drivers_caller_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_drivers_caller_is_admin() TO authenticated, service_role;

-- Full-row read, admin-only. Powers both the Active Drivers roster and the
-- BGC-status lookup Driver Applications joins in.
CREATE OR REPLACE FUNCTION public.admin_list_drivers()
RETURNS SETOF public.drivers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.admin_drivers_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can list drivers'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public.drivers ORDER BY created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_drivers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_drivers() TO authenticated;

-- Approve a driver application: requires bgc_status in ('passed','consider')
-- (same rule already enforced client-side — this is the server-side
-- backstop), then updates the existing drivers row to status='active', or
-- inserts one if the applicant never got one created (e.g. via runDriverBgc).
CREATE OR REPLACE FUNCTION public.admin_approve_driver(
  p_profile_id uuid,
  p_full_name  text,
  p_phone      text,
  p_email      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  existing_id uuid;
  bgc         text;
BEGIN
  IF NOT public.admin_drivers_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve drivers'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, bgc_status INTO existing_id, bgc
    FROM public.drivers WHERE profile_id = p_profile_id;

  IF bgc IS NULL THEN
    bgc := 'not_started';
  END IF;

  IF bgc NOT IN ('passed', 'consider') THEN
    RAISE EXCEPTION 'Background check must pass before approving this driver'
      USING ERRCODE = 'check_violation';
  END IF;

  IF existing_id IS NOT NULL THEN
    UPDATE public.drivers
       SET status = 'active', onboarded_at = now(), updated_at = now()
     WHERE id = existing_id;
  ELSE
    INSERT INTO public.drivers (profile_id, full_name, phone, email, status, vehicle_class, hourly_rate_cents, per_job_rate_cents, onboarded_at)
    VALUES (p_profile_id, COALESCE(p_full_name, 'Driver'), COALESCE(p_phone, ''), COALESCE(p_email, ''), 'active', ARRAY[]::text[], 0, 0, now());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_driver(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_driver(uuid, text, text, text) TO authenticated;

-- Suspend / reactivate an existing driver.
CREATE OR REPLACE FUNCTION public.admin_set_driver_status(p_driver_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.admin_drivers_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can change driver status'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.drivers SET status = p_status, updated_at = now() WHERE id = p_driver_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_driver_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_driver_status(uuid, text) TO authenticated;

-- ============================================================================
-- End of 20260903d_admin_drivers_rpcs.sql
-- ============================================================================
