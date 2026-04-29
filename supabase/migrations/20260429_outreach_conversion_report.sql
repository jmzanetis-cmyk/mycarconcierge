-- ============================================================================
-- Outreach → Application conversion-rate report (Task #190)
--
-- The Task #136 backfill stamped outreach_lead_id onto every existing
-- provider_application that originated from an outreach_leads row, and the
-- 20260425_outreach_crm_bridge migration added the auto-link trigger that
-- keeps it filled going forward. The data is now there to measure the funnel
-- the bridge column was created to track:
--
--      outreach_leads
--           │  (auto_link_outreach_lead trigger sets crm_profile_id when a
--           ▼   matching profile is created)
--      profiles  ──────────────────────────────►  provider_applications
--                                                 (.outreach_lead_id stamped
--                                                  by submit-application path
--                                                  + Task #136 backfill)
--
-- This migration adds a single SQL-driven RPC that returns the funnel counts
-- per outreach source, optionally filtered by a lead created_at date range so
-- we can compare campaign performance over time. No per-row Node loops — all
-- aggregation happens in Postgres in a single query.
--
-- Apply via Supabase SQL Editor (paste the file). Same manual-apply pattern
-- as 20260425_outreach_crm_bridge.sql.
-- ============================================================================

-- Drop any prior version first so the column shape can evolve without
-- "cannot change return type of existing function" errors.
DROP FUNCTION IF EXISTS public.outreach_conversion_report(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.outreach_conversion_report(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  source                          TEXT,
  leads_contacted                 BIGINT,
  profiles_created                BIGINT,
  provider_applications_submitted BIGINT,
  lead_to_profile_pct             NUMERIC,
  profile_to_application_pct      NUMERIC,
  lead_to_application_pct         NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH leads AS (
    -- Canonicalize source so historical drift collapses into one bucket:
    -- lower-case + trim, then collapse runs of whitespace/hyphens to a single
    -- underscore (e.g. 'Apollo', 'apollo', 'Google Places', 'google-places'
    -- all bucket cleanly). Empty/NULL → 'unknown'.
    SELECT
      COALESCE(
        NULLIF(
          REGEXP_REPLACE(LOWER(TRIM(l.source)), '[\s\-]+', '_', 'g'),
          ''
        ),
        'unknown'
      ) AS source,
      l.id,
      l.crm_profile_id
    FROM outreach_leads l
    WHERE (p_from IS NULL OR l.created_at >= p_from)
      AND (p_to   IS NULL OR l.created_at <  p_to)
  ),
  -- Funnel semantics: each stage counts DISTINCT leads that reached the
  -- stage, not raw row counts. A single lead with two provider_applications
  -- still counts once in the application stage so that conversion
  -- percentages are bounded by 100% (true funnel, not a fan-out ratio).
  --
  -- Strict-subset rule: a lead is "in the application stage" only if it
  -- also reached the profile stage (crm_profile_id IS NOT NULL). The
  -- bridge trigger in 20260425_outreach_crm_bridge.sql stamps
  -- crm_profile_id whenever an outreach_lead becomes a profile, so an
  -- application without a profile would be a data anomaly. Guarding here
  -- keeps profile_to_application_pct bounded at 100% even if such an
  -- anomaly slips in.
  per_lead AS (
    SELECT
      l.source,
      l.id,
      (l.crm_profile_id IS NOT NULL)         AS has_profile,
      (
        l.crm_profile_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM provider_applications pa
           WHERE pa.outreach_lead_id = l.id
        )
      )                                       AS has_application
    FROM leads l
  )
  SELECT
    pl.source,
    COUNT(*)::BIGINT                                       AS leads_contacted,
    COUNT(*) FILTER (WHERE pl.has_profile)::BIGINT         AS profiles_created,
    COUNT(*) FILTER (WHERE pl.has_application)::BIGINT     AS provider_applications_submitted,
    CASE
      WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE pl.has_profile)::NUMERIC
                  / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END AS lead_to_profile_pct,
    CASE
      WHEN COUNT(*) FILTER (WHERE pl.has_profile) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE pl.has_application)::NUMERIC
                  / COUNT(*) FILTER (WHERE pl.has_profile)::NUMERIC) * 100, 2)
      ELSE 0
    END AS profile_to_application_pct,
    CASE
      WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE pl.has_application)::NUMERIC
                  / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END AS lead_to_application_pct
  FROM per_lead pl
  GROUP BY pl.source
  ORDER BY COUNT(*) DESC, pl.source ASC;
$$;

-- IMPORTANT: service_role ONLY. The numbers themselves are aggregated and
-- non-PII, but we keep this consistent with the rest of the outreach RPC
-- surface (check_crm_duplicate, increment_engine_stat) — every call site is
-- a Netlify admin function that already uses the service-role client.
REVOKE ALL ON FUNCTION public.outreach_conversion_report(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.outreach_conversion_report(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.outreach_conversion_report(TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.outreach_conversion_report(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
