-- ============================================================================
-- provider_documents admin SELECT policy — same shape as 20260918d.
--
-- Background: `www/admin-review-payments.js:7` reads
-- `supabaseClient.from('provider_documents').select('*').eq('application_id', ...)`
-- from the admin's authenticated JWT. Without an admin SELECT policy on
-- provider_documents, that call returns an empty set silently — same
-- failure mode as CAR Reviews before 20260918d.
--
-- No policies on public.provider_documents live in the migrations folder
-- (grep confirmed). The provider-scoped policies exist only in prod (same
-- pattern as profiles/vehicles/car_clubs). This migration adds the admin
-- SELECT policy without touching the existing provider-scoped policies.
--
-- Uses public.is_admin() as-is — same helper called by 20260918c/d and by
-- the prod-only `profiles_select_admin` / `vehicles_all_admin` policies.
-- Body recorded verbatim in docs/audit/2026-09-18-live-rls-state.sql.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY. Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all provider documents" ON public.provider_documents;
CREATE POLICY "Admins can view all provider documents"
  ON public.provider_documents
  FOR SELECT
  USING (public.is_admin());
