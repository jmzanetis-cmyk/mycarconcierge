-- ============================================================================
-- Hardening — restrict the RLS policies created in 20260918b and 20260918d
-- to the `authenticated` role explicitly.
--
-- Background: the policies land today with the default `roles = {public}`,
-- which means PostgREST evaluates them for anon callers too. Behavior is
-- unchanged in practice because every predicate ultimately relies on
-- auth.uid() (returns NULL for anon) or public.is_admin() (returns false
-- for anon since no profile row matches), so anon reads already fail. This
-- migration adds `TO authenticated` as belt-and-suspenders: it makes the
-- role scoping explicit at the policy level rather than implicit via the
-- predicate, and it lets pg_policies grep cleanly filter "which policies
-- are actually reachable by anon" (none, going forward).
--
-- Scope: the seven policies from 20260918b_car_club_commission_policies_codify.sql
-- and the one policy from 20260918d_car_reviews_admin_select_policy.sql.
-- The 20260919b "Admins can view all provider documents" policy is NOT in
-- scope here (it's a separate, later addition — will be TO-authenticated'd
-- alongside future admin policies if a follow-up sweeps them).
--
-- All predicates are unchanged — same USING / WITH CHECK clauses as the
-- originating migrations. Only the role restriction is added.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY. Safe to re-run.
-- ============================================================================


-- ---- 20260918b policies — car_clubs / club_memberships / commission_rate_history ----

-- car_clubs — three SELECT policies

DROP POLICY IF EXISTS car_clubs_discovery_read ON public.car_clubs;
CREATE POLICY car_clubs_discovery_read ON public.car_clubs
  FOR SELECT
  TO authenticated
  USING ((is_active IS NOT FALSE) AND (provider_suspended IS NOT TRUE));

DROP POLICY IF EXISTS car_clubs_member_read ON public.car_clubs;
CREATE POLICY car_clubs_member_read ON public.car_clubs
  FOR SELECT
  TO authenticated
  USING (public.is_club_member(id, auth.uid()));

DROP POLICY IF EXISTS car_clubs_provider_read ON public.car_clubs;
CREATE POLICY car_clubs_provider_read ON public.car_clubs
  FOR SELECT
  TO authenticated
  USING (provider_id = auth.uid());

-- club_memberships — two SELECT policies

DROP POLICY IF EXISTS club_memberships_provider_read ON public.club_memberships;
CREATE POLICY club_memberships_provider_read ON public.club_memberships
  FOR SELECT
  TO authenticated
  USING (public.is_club_provider(club_id, auth.uid()));

DROP POLICY IF EXISTS club_memberships_self_read ON public.club_memberships;
CREATE POLICY club_memberships_self_read ON public.club_memberships
  FOR SELECT
  TO authenticated
  USING (member_id = auth.uid());

-- commission_rate_history — admin-only SELECT + INSERT

DROP POLICY IF EXISTS "Admins can view commission rate history" ON public.commission_rate_history;
CREATE POLICY "Admins can view commission rate history" ON public.commission_rate_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert commission rate history" ON public.commission_rate_history;
CREATE POLICY "Admins can insert commission rate history" ON public.commission_rate_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );


-- ---- 20260918d policy — corrective_action_responses admin SELECT ----

DROP POLICY IF EXISTS "Admins can view all CARs" ON public.corrective_action_responses;
CREATE POLICY "Admins can view all CARs"
  ON public.corrective_action_responses
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
