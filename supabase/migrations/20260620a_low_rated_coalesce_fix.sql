-- ============================================================================
-- 20260620a_low_rated_coalesce_fix.sql
-- Fix: low_rated_providers reads the wrong rating column
--
-- BACKGROUND:
--   The original 20260620_low_rated_providers_rpc.sql aggregates AVG(rating)
--   from provider_reviews. Investigation on 2026-06-20 revealed that the
--   table has BOTH `rating` and `overall_rating` columns, and the member
--   review-submission path inserts into overall_rating, not rating:
--
--     members.js:6904-6922 — submitProviderReview payload:
--       const reviewData = {
--         provider_id, member_id, package_id,
--         overall_rating: overallRating,   // ← member's 1-5 score lives here
--         quality_rating, ..., complaint_reason, status: 'published', ...
--       };
--
--   Production read-paths handle the dual column with COALESCE-style fallback:
--
--     netlify/functions/directory-providers.js:39
--       const sum = valid.reduce((acc, r) => acc + (r.overall_rating ?? r.rating), 0);
--     netlify/functions/directory-providers.js:249
--       const rating = r.overall_rating ?? r.rating;
--
--   So `overall_rating` is the canonical member-write column, and `rating`
--   is the legacy / fallback column populated by some earlier write path
--   (likely a baseline trigger; the 5 published prod rows have it set).
--   Reading only `rating` causes the gate to ignore every member-submitted
--   review going forward.
--
-- FIX:
--   Mirror the directory-providers read convention. Aggregate
--   COALESCE(overall_rating, rating), and filter rows where that coalesced
--   value is non-null.
--
-- WHAT IS UNCHANGED:
--   Signature, return shape, SECURITY DEFINER, search_path, status filter,
--   HAVING (min_reviews + threshold), REVOKE/GRANT. Drop-in replacement.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.low_rated_providers(
  p_threshold   numeric DEFAULT 3.0,
  p_min_reviews int     DEFAULT 10
)
RETURNS TABLE (
  provider_id   uuid,
  avg_rating    numeric,
  review_count  int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    provider_id,
    ROUND(AVG(COALESCE(overall_rating, rating))::numeric, 2) AS avg_rating,
    COUNT(*)::int                                            AS review_count
  FROM provider_reviews
  WHERE COALESCE(overall_rating, rating) IS NOT NULL
    AND provider_id                      IS NOT NULL
    AND status                           = 'published'
  GROUP BY provider_id
  HAVING COUNT(*) >= p_min_reviews
     AND AVG(COALESCE(overall_rating, rating)) < p_threshold;
$$;

-- Grants/revokes are unchanged from 20260620; CREATE OR REPLACE preserves
-- privileges in Postgres, but we re-assert here defensively so re-apply
-- against a freshly-DROPPED function still ends up locked down.
REVOKE EXECUTE
  ON FUNCTION public.low_rated_providers(numeric, int)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.low_rated_providers(numeric, int)
  TO service_role;
