-- ============================================================================
-- CAR Reviews admin SELECT policy — closes the follow-up flagged in
-- 20260621a_capa_system_capture.sql header NOTE #1.
--
-- Background: 20260621a captured the CAR (Corrective Action Response)
-- system verbatim from prod, including the intentional-at-the-time
-- decision to have NO admin SELECT policy on
-- public.corrective_action_responses — only three provider-scoped
-- policies (provider_id = auth.uid()). The header note explicitly left
-- open "confirm whether the admin queue reads via service-role/backend
-- OR whether the queue has been silently broken in prod".
--
-- Confirmed 2026-09-18: the admin queue is broken. `loadPendingCARs()`
-- at www/admin-users-verification.js:606 reads via the anon+JWT client:
--     supabaseClient.from('corrective_action_responses').select(...)
-- RLS returns an error (or empty set) and the admin UI shows "No CAR
-- submissions" for every tab. Live-verified before this migration.
--
-- Writes are unaffected — `reviewCAR()` at
-- www/admin-users-verification.js calls the `review_corrective_action`
-- RPC (SECURITY DEFINER, bypasses RLS), so admin approve/reject/
-- revision-request flows are already working. Only SELECT is broken.
-- This migration therefore only adds a SELECT policy, not UPDATE.
--
-- Uses public.is_admin() as-is (SECURITY DEFINER + STABIL, reads
-- profiles.role by auth.uid()). Body recorded verbatim in
-- docs/audit/2026-09-18-live-rls-state.sql — do NOT CREATE OR REPLACE
-- it from a migration; call it as the existing policy on provider_stats
-- already does (see 20260621a section 5).
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY. Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all CARs" ON public.corrective_action_responses;
CREATE POLICY "Admins can view all CARs"
  ON public.corrective_action_responses
  FOR SELECT
  USING (public.is_admin());
