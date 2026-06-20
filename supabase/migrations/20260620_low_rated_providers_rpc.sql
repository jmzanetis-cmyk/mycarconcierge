-- ============================================================================
-- 20260620_low_rated_providers_rpc.sql
-- low_rated_providers — aggregation RPC for the provider quality gate (Step 1c)
--
-- Replaces the read of profiles.provider_stats.average_rating in
-- _handleCheckLowRated (provider-admin.js), which is unmaintained by any
-- production code path. This RPC aggregates from public.provider_reviews
-- directly — the only review table that actually exists in prod (the file-
-- referenced public.reviews table was confirmed absent on 2026-06-20).
--
-- WHY public.provider_reviews:
--   PostgREST probe on 2026-06-20 returned HTTP 200 for provider_reviews
--   and HTTP 404 (PGRST205) for reviews. The provider-side CAR loader in
--   www/providers.js:805 also reads from('provider_reviews').eq('status',
--   'published'). So provider_reviews is the canonical review source AND
--   'published' is the live status value to filter on.
--
-- WHY the parameters:
--   p_threshold = 3.0 — Build plan 2026-06-19, Step 1c sub-decision. The
--     current _handleCheckLowRated defaults to 4 (too lenient) and this
--     restores the originally-intended 3.0 floor.
--   p_min_reviews = 10 — same source. Prevents a single 2-star review from
--     flagging a brand-new provider. Tunable upward (50-100) once review
--     volume grows.
--
-- WHY no autosuspend in the caller:
--   This RPC returns CANDIDATES only. The Step 1c contract is flag-for-
--   admin-review, not auto-action. The admin then uses the existing manual
--   Suspend action (which, after the Step 1c admin.js fix, passes
--   set_role_suspended:true so the role flip actually engages the bid gate).
--
-- SECURITY (two-layer, per 20260615b convention):
--   Layer 1: REVOKE EXECUTE from PUBLIC, anon, authenticated.
--   Layer 2: SECURITY DEFINER with search_path pinned to public, pg_temp.
--   No in-function role guard because the function is read-only and
--   service_role is the only grantee.
-- ============================================================================

DROP FUNCTION IF EXISTS public.low_rated_providers(numeric, int);

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
    ROUND(AVG(rating)::numeric, 2) AS avg_rating,
    COUNT(*)::int                  AS review_count
  FROM provider_reviews
  WHERE rating       IS NOT NULL
    AND provider_id  IS NOT NULL
    AND status       = 'published'
  GROUP BY provider_id
  HAVING COUNT(*) >= p_min_reviews
     AND AVG(rating) < p_threshold;
$$;

-- ── Layer 1: REVOKE / GRANT ────────────────────────────────────────────────
REVOKE EXECUTE
  ON FUNCTION public.low_rated_providers(numeric, int)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.low_rated_providers(numeric, int)
  TO service_role;
