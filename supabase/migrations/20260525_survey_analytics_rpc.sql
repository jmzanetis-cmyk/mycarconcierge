-- Task #392: Move Survey Analytics aggregation into a single database query.
--
-- Replaces the Node-side "fetch up to 1000 rows and aggregate in JS" path
-- (introduced by Task #226) with one GROUP BY per dimension executed inside
-- Postgres. Returns the same JSON shape /api/admin/survey-analytics has
-- always returned so the admin dashboard needs no client changes.
--
-- Shape:
--   {
--     "total":       <int>,                -- count(*) over survey_responses
--     "recent_week": <int>,                -- count(*) in the last 7 days
--     "by_provider_discovery":    { "<value>": <count>, ... },
--     "by_provider_satisfaction": { "<value>": <count>, ... },
--     ...one key per tracked dimension column...
--   }
--
-- SECURITY DEFINER so the function can read survey_responses regardless of
-- RLS on the caller. The /api/admin/survey-analytics HTTP handler still
-- enforces admin/super_admin role on the calling user before invoking it.

CREATE OR REPLACE FUNCTION public.admin_survey_analytics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH totals AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (
        WHERE created_at > now() - interval '7 days'
      )::int AS recent_week
    FROM survey_responses
  ),
  unpivoted AS (
    SELECT col, value
    FROM survey_responses sr,
      LATERAL (VALUES
        ('provider_discovery',    sr.provider_discovery),
        ('provider_satisfaction', sr.provider_satisfaction),
        ('service_frequency',     sr.service_frequency),
        ('service_types',         sr.service_types),
        ('pricing_confidence',    sr.pricing_confidence),
        ('estimate_surprise',     sr.estimate_surprise),
        ('quote_behavior',        sr.quote_behavior),
        ('provider_honesty',      sr.provider_honesty),
        ('provider_vetting',      sr.provider_vetting),
        ('history_tracking',      sr.history_tracking),
        ('maintenance_avoidance', sr.maintenance_avoidance),
        ('job_status_updates',    sr.job_status_updates),
        ('maintenance_reminders', sr.maintenance_reminders),
        ('competitive_bids',      sr.competitive_bids),
        ('app_usage',             sr.app_usage),
        ('payment_comfort',       sr.payment_comfort),
        ('dispute_history',       sr.dispute_history),
        ('annual_spend',          sr.annual_spend),
        ('decision_maker',        sr.decision_maker),
        ('near_term_need',        sr.near_term_need),
        ('top_priority',          sr.top_priority),
        ('vehicle_count',         sr.vehicle_count)
      ) AS v(col, value)
    WHERE value IS NOT NULL AND value <> ''
  ),
  counts AS (
    SELECT col, value, count(*)::int AS n
    FROM unpivoted
    GROUP BY col, value
  ),
  per_dimension AS (
    SELECT
      'by_' || col AS key,
      jsonb_object_agg(value, n) AS counts
    FROM counts
    GROUP BY col
  )
  SELECT
    jsonb_build_object(
      'total',       (SELECT total       FROM totals),
      'recent_week', (SELECT recent_week FROM totals)
    )
    || COALESCE(
      (SELECT jsonb_object_agg(key, counts) FROM per_dimension),
      '{}'::jsonb
    );
$$;

-- Admin-only: the HTTP handler in www/server.js authenticates the caller and
-- checks profiles.role IN ('admin','super_admin') BEFORE invoking this RPC
-- with the service-role Supabase client. Granting EXECUTE to `authenticated`
-- would let any signed-in user bypass that check by calling the RPC directly
-- via the public PostgREST endpoint, which combined with SECURITY DEFINER
-- would leak the full survey aggregation. Keep EXECUTE restricted to
-- service_role only.
REVOKE ALL ON FUNCTION public.admin_survey_analytics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_survey_analytics() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_survey_analytics() TO service_role;
