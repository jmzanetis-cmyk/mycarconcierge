-- ============================================================================
-- Backfill provider_id from provider_applications.user_id on the three
-- Verification-flow tables — closes the Phase 3 handleReference bug
-- (netlify/functions/provider-onboarding.js:262-269 inserted references
-- without provider_id, so rows created by "Add reference" had NULL
-- provider_id and were invisible to the provider under the
-- auth.uid() = provider_id self-read policy).
--
-- Prod state at write-time (2026-09-19): all three tables have 0 rows —
-- Phase 3 hasn't had real signups flow through yet, so no live data is
-- actually affected. Migration is defensive: idempotent by predicate
-- (WHERE provider_id IS NULL), safe to re-run, and codifies the
-- provider_id = provider_applications.user_id invariant for any future
-- rows that might slip through if the code fix regresses.
--
-- Companion code fix landed same branch: handleReference now inserts
-- { application_id, provider_id: user.id, ... } same as handleDocument
-- and handleExternalReview always did.
-- ============================================================================


-- ---- provider_references ----
UPDATE public.provider_references pr
   SET provider_id = pa.user_id
  FROM public.provider_applications pa
 WHERE pr.application_id = pa.id
   AND pr.provider_id IS NULL;


-- ---- provider_external_reviews (defensive; handler already sets provider_id) ----
UPDATE public.provider_external_reviews per
   SET provider_id = pa.user_id
  FROM public.provider_applications pa
 WHERE per.application_id = pa.id
   AND per.provider_id IS NULL;


-- ---- provider_documents (defensive; handler already sets provider_id) ----
UPDATE public.provider_documents pd
   SET provider_id = pa.user_id
  FROM public.provider_applications pa
 WHERE pd.application_id = pa.id
   AND pd.provider_id IS NULL;
