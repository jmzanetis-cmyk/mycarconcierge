-- ============================================================================
-- Codify admin SELECT + provider self-read policies on the two Phase 3
-- Verification tables — provider_external_reviews and provider_references.
--
-- Same shape as 20260919b did for provider_documents, but for the tables
-- Phase 3's Verification section reads via /api/provider/verification and
-- the admin Applications queue reads via www/admin-review-payments.js:~L7–9.
--
-- Live prod state (2026-09-19 capture — pg_policies):
--
--   provider_external_reviews
--     per_select_admin   FOR SELECT USING (is_admin())
--     per_select_own     FOR SELECT USING (auth.uid() = provider_id)
--   provider_references
--     pref_select_admin  FOR SELECT USING (is_admin())
--     pref_select_own    FOR SELECT USING (auth.uid() = provider_id)
--
-- Predicates are unchanged. This migration:
--   1. Recreates the four policies under consistent human-readable names
--      matching the naming used in 20260918b/d and 20260919b ("Admins can
--      view all …" / "Providers can view their own …").
--   2. Drops both the legacy short names AND the new long names first so
--      it's re-runnable and safe on a fresh clone (which has neither).
--   3. Restricts the roles to `authenticated` explicitly per the
--      20260919c belt-and-suspenders pattern — anon can't reach these
--      tables at all today via the predicates (both use auth.uid() or
--      is_admin(), which return NULL/false for anon), but scoping the
--      roles at the policy level lets pg_policies grep cleanly show
--      "which policies are actually reachable by anon" (none).
--
-- Why this exists: the two policy sets have been living in prod as
-- Studio-created untracked policies since Phase 3 signup shipped review/
-- reference writes. Same drift pattern that 20260918b closed for
-- car_clubs / club_memberships and 20260919b closed for provider_documents.
-- Recording them in the migrations folder now so a fresh Supabase project
-- reproduces the same live shape.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY. Safe to re-run.
-- ============================================================================


-- ---- provider_external_reviews ----

DROP POLICY IF EXISTS per_select_admin ON public.provider_external_reviews;
DROP POLICY IF EXISTS "Admins can view all provider external reviews" ON public.provider_external_reviews;
CREATE POLICY "Admins can view all provider external reviews"
  ON public.provider_external_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS per_select_own ON public.provider_external_reviews;
DROP POLICY IF EXISTS "Providers can view their own external reviews" ON public.provider_external_reviews;
CREATE POLICY "Providers can view their own external reviews"
  ON public.provider_external_reviews
  FOR SELECT
  TO authenticated
  USING (auth.uid() = provider_id);


-- ---- provider_references ----

DROP POLICY IF EXISTS pref_select_admin ON public.provider_references;
DROP POLICY IF EXISTS "Admins can view all provider references" ON public.provider_references;
CREATE POLICY "Admins can view all provider references"
  ON public.provider_references
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS pref_select_own ON public.provider_references;
DROP POLICY IF EXISTS "Providers can view their own references" ON public.provider_references;
CREATE POLICY "Providers can view their own references"
  ON public.provider_references
  FOR SELECT
  TO authenticated
  USING (auth.uid() = provider_id);
