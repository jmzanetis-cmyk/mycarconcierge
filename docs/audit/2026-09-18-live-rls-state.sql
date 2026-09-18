-- ============================================================================
-- docs/audit/2026-09-18-live-rls-state.sql
--
-- One dated snapshot of live RLS state pulled from prod on 2026-09-18 as
-- part of the Tier-0.5 RLS lockdown sweep (Tasks #469-#474). The public
-- schema's RLS state predates the supabase/migrations/ folder in many
-- places, so this file is the repo's authoritative record.
--
-- Documentation only. DO NOT APPLY. Re-running would try to CREATE
-- policies that already exist and would fail.
--
-- Capture queries live in scripts/dump-rls-state.sql — re-run to
-- refresh, then paste the results here (or into a new
-- YYYY-MM-DD-live-rls-state.sql file for the next capture day).
--
-- Sections (in order):
--   1. Query B — public tables with RLS disabled
--   2. Query A — pg_policies on the seven outreach tables
--   3. public.is_admin() helper
--   4. profiles policies (Task #469 query C)
--   5. vehicles policies (Task #469 query C)
--   6. car_clubs / club_memberships / commission_rate_history policies
--      (Task #469 supplementary capture, codified by
--      supabase/migrations/20260918b_car_club_commission_policies_codify.sql)
--   7. is_club_member + is_club_provider helpers (called by section 6
--      policies; called as-is by 20260918b)
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
--   supabase/migrations/20260918a_outreach_policies_drop_dead.sql
--     — DROP POLICY IF EXISTS on the seven service_role_* policy names
--       from 20260420_outreach_engine_initial.sql. Section 2 below
--       confirms those policies are not present in prod today.
--   supabase/migrations/20260918b_car_club_commission_policies_codify.sql
--     — CREATE POLICY statements matching section 6 verbatim, plus
--       idempotent ALTER TABLE ENABLE ROW LEVEL SECURITY.
-- ============================================================================


-- ============================================================================
-- 1. Query B — public tables with RLS disabled (relrowsecurity = false)
--    Result: one row, schema_migrations. Every other public table has
--    RLS enabled. Notably, this contradicts the original audit note
--    ("twelve tables with no RLS"). RLS was enabled directly on prod
--    between the audit draft and the Task #469 live capture; see the
--    ordering discussion in Task #471.
-- ============================================================================
-- Result rows:
--   schema_migrations


-- ============================================================================
-- 2. Query A — pg_policies on the seven outreach engine tables
--    (engine_state, opportunity_pipeline, outreach_leads, outreach_messages,
--     outreach_campaigns, campaign_leads, outreach_activity_log)
--    Result: 0 rows. The tables have RLS on (per Query B) with zero
--    policies — meaning they are already service-role only. The
--    20260420_outreach_engine_initial.sql `service_role_*` policies
--    (FOR ALL USING (true) with no TO clause, which would have opened
--    them to anon+authenticated) were never applied to prod (or were
--    dropped later out-of-band). Task #470 codifies this via
--    20260918a_outreach_policies_drop_dead.sql (DROP POLICY IF EXISTS).
-- ============================================================================
-- Result rows: (none)


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


-- ============================================================================
-- 6. public.car_clubs / club_memberships / commission_rate_history policies
--    (Task #469 supplementary capture, all roles = {public}).
--    RLS is enabled on all three tables. Nine other Task #471 tables
--    (club_activity_log, club_reward_rules, car_club_benefits,
--    car_club_redemptions, car_club_return_bonuses, community_posts,
--    founder_campaign_clicks, founder_campaign_investments,
--    admin_audit_log) have RLS on with no policies — service-role only.
--    Codified verbatim by
--    supabase/migrations/20260918b_car_club_commission_policies_codify.sql.
-- ============================================================================

-- ---- car_clubs — three SELECT policies ----

-- Discovery read: any authenticated caller sees active, non-suspended clubs.
CREATE POLICY car_clubs_discovery_read ON public.car_clubs
  FOR SELECT
  USING ((is_active IS NOT FALSE) AND (provider_suspended IS NOT TRUE));

-- Member read: caller is a member of this club.
CREATE POLICY car_clubs_member_read ON public.car_clubs
  FOR SELECT
  USING (is_club_member(id, auth.uid()));

-- Provider read: caller owns this club.
CREATE POLICY car_clubs_provider_read ON public.car_clubs
  FOR SELECT
  USING (provider_id = auth.uid());

-- ---- club_memberships — two SELECT policies ----

-- Provider read: caller is the provider of the club this membership belongs to.
CREATE POLICY club_memberships_provider_read ON public.club_memberships
  FOR SELECT
  USING (is_club_provider(club_id, auth.uid()));

-- Self read.
CREATE POLICY club_memberships_self_read ON public.club_memberships
  FOR SELECT
  USING (member_id = auth.uid());

-- ---- commission_rate_history — admin-only SELECT + INSERT ----

CREATE POLICY "Admins can view commission rate history" ON public.commission_rate_history
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can insert commission rate history" ON public.commission_rate_history
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );


-- ============================================================================
-- 7. Helper functions called by section 6's policies
--    (pg_get_functiondef, 2026-09-18). Both SECURITY DEFINER + STABLE with
--    SET search_path = 'public'. Called from car_clubs and club_memberships
--    policies. Called as-is by 20260918b — DO NOT CREATE OR REPLACE from a
--    migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.club_memberships m
    WHERE m.club_id   = p_club_id
      AND m.member_id = p_user
      AND m.is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_club_provider(p_club_id uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from car_clubs c where c.id = p_club_id and c.provider_id = p_user);
$function$;
