-- ============================================================================
-- docs/audit/2026-09-18-profiles-vehicles-policies.sql
--
-- Verbatim state of public.profiles and public.vehicles RLS policies + the
-- public.is_admin() helper function, pulled from live prod on 2026-09-18
-- as part of Task #469's query C. These objects predate the
-- supabase/migrations/ folder (which starts spring 2025) and therefore
-- live only in the DB — this file exists so the repo has an
-- authoritative record.
--
-- Documentation only. DO NOT APPLY. Re-running would try to CREATE
-- policies that already exist and would fail.
--
-- Referenced by:
--   supabase/migrations/20260918c_profiles_privileged_columns_guard.sql
--     — calls public.is_admin() as-is from both BEFORE UPDATE and BEFORE
--       INSERT triggers. Reasoning (per Task #474): is_admin is SECURITY
--       DEFINER + STABLE and reads profiles.role by auth.uid(), so inside
--       a BEFORE UPDATE trigger it evaluates against the pre-write row
--       (self-escalation via NEW.role='admin' can't win in the same
--       statement), and inside BEFORE INSERT it returns false for a new
--       user because their profiles row doesn't exist yet. Do NOT
--       "optimize" this into a JWT-claim check — that would break the
--       recursion argument.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Helper function
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$;


-- ----------------------------------------------------------------------------
-- public.profiles policies (all roles = {public})
-- ----------------------------------------------------------------------------

-- INSERT — self only, no column restriction. The gap that Task #474's
-- BEFORE INSERT trigger (20260918c) closes.
CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- SELECT — admins see all.
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT
  USING (is_admin());

-- SELECT — counterparties on an accepted bid can see each other's profiles.
CREATE POLICY profiles_select_counterparty ON public.profiles
  FOR SELECT
  USING (
    (EXISTS (SELECT 1 FROM bids b
             JOIN maintenance_packages mp ON mp.id = b.package_id
             WHERE b.provider_id = auth.uid()
               AND mp.member_id = profiles.id
               AND b.status = 'accepted'))
    OR
    (EXISTS (SELECT 1 FROM bids b
             JOIN maintenance_packages mp ON mp.id = b.package_id
             WHERE mp.member_id = auth.uid()
               AND b.provider_id = profiles.id
               AND b.status = 'accepted'))
  );

-- SELECT — fleet drivers (function-gated).
CREATE POLICY profiles_select_fleet_driver ON public.profiles
  FOR SELECT
  USING (fleet_driver_profile_is_visible(id));

-- SELECT — preferred-provider surface (function-gated).
CREATE POLICY profiles_select_preferred_provider ON public.profiles
  FOR SELECT
  USING (is_preferred_provider(id));

-- SELECT — any authenticated user sees every provider profile row.
-- Flagged by Task #474 "Also from the live policy dump" as PII exposure:
-- exposes email, phone, street_address, stripe_customer_id, saas cache,
-- bgc stats, etc. Public directory already uses directory-providers.js
-- with a curated column list, so narrow this to a public view or
-- column-level grants. Not fixed in #474; separate follow-up.
CREATE POLICY profiles_select_providers ON public.profiles
  FOR SELECT
  USING ((auth.uid() IS NOT NULL) AND (role = 'provider'));

-- SELECT — self.
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- UPDATE — self, no column restriction. The gap that Task #474's BEFORE
-- UPDATE trigger (20260918c) closes.
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ----------------------------------------------------------------------------
-- public.vehicles policies (all roles = {public})
-- ----------------------------------------------------------------------------

-- ALL — owners can do everything to their own vehicles.
-- Note: no explicit WITH CHECK, so Postgres uses USING as WITH CHECK by
-- default, meaning INSERT is allowed whenever auth.uid() = owner_id
-- regardless of verification state. This OR's with the "Verified members
-- can insert own vehicles" policy below (permissive policies are OR'd),
-- so the is_identity_verified gate on INSERT is dead. Flagged by Task
-- #474 "Also from the live policy dump" — fix by splitting into
-- SELECT/UPDATE/DELETE and dropping INSERT from the ALL policy, so the
-- verified-insert policy is the only INSERT path.
CREATE POLICY "Members can manage own vehicles" ON public.vehicles
  FOR ALL
  USING (auth.uid() = owner_id);

-- INSERT — verified members only. Currently a dead gate; see the note on
-- "Members can manage own vehicles" above.
CREATE POLICY "Verified members can insert own vehicles" ON public.vehicles
  FOR INSERT
  WITH CHECK ((auth.uid() = owner_id) AND is_identity_verified(auth.uid()));

-- INSERT — admins.
CREATE POLICY "Admins can insert vehicles" ON public.vehicles
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );

-- ALL — admins (mirrors the is_admin() shorthand used elsewhere).
CREATE POLICY vehicles_all_admin ON public.vehicles
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
