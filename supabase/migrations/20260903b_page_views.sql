-- ============================================================================
-- 20260903b — page_views table
--
-- www/analytics-tracker.js and server.js's /api/analytics/track +
-- /api/analytics/data have referenced this table since at least the prior
-- "Audit Batch 2 (2026-07-16)" pass (see the comment left in
-- analytics-tracker.js, which disabled the tracker as a no-op pending this
-- table/endpoint), but no migration ever created it — same class of gap as
-- admin_team_members (20260903a) and the registration/insurance storage
-- buckets (20260902b). Creating it now as part of porting the Traffic admin
-- section's backend off server.js and onto a real Netlify function.
--
-- Written via a Netlify function using the service-role key, so RLS is
-- enabled with no policies (same rationale as 20260903a) — no anon/
-- authenticated client should read or write this table directly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS page_views (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page       text NOT NULL,
  referrer   text,
  device     text,
  visitor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON page_views(created_at);
CREATE INDEX IF NOT EXISTS page_views_visitor_id_idx ON page_views(visitor_id);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- End of 20260903b_page_views.sql
-- ============================================================================
