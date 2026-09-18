-- scripts/dump-rls-state.sql
--
-- Capture live Supabase RLS state for the docs/audit/YYYY-MM-DD-live-rls-state.sql
-- snapshot. Read-only, idempotent — safe to re-run any time. Paste each
-- result under the matching section header in the audit file.
--
-- Usage: run each query below in the Supabase SQL editor, one at a time.
-- Copy the tabular output verbatim into the audit file, prefixed by the
-- section number. If any query returns 0 rows, still record that as
-- "Result rows: (none)" so future readers can distinguish "no data" from
-- "not yet run".
--
-- Kept intentionally minimal: only the queries the Tier-0.5 audit relied
-- on (Task #469). Extend if a future capture needs more shape.


-- ============================================================================
-- Query A — service_role_* policies on the seven outreach engine tables.
-- Expected: 0 rows (tables should be service-role only via RLS + no policies).
-- ============================================================================
SELECT tablename, policyname, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN (
     'engine_state', 'opportunity_pipeline', 'outreach_leads',
     'outreach_messages', 'outreach_campaigns', 'campaign_leads',
     'outreach_activity_log'
   )
 ORDER BY tablename, policyname;


-- ============================================================================
-- Query B — public tables with RLS disabled.
-- Expected: 1 row, schema_migrations. Any other row is a lockdown gap.
-- ============================================================================
SELECT relname
  FROM pg_class
 WHERE relnamespace = 'public'::regnamespace
   AND relkind = 'r'
   AND NOT relrowsecurity
 ORDER BY relname;


-- ============================================================================
-- Query C — every RLS policy on every public table.
-- Verbose. Grep out the tables you care about, or filter WHERE tablename IN (...).
-- ============================================================================
SELECT tablename, policyname, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;


-- ============================================================================
-- Query D — anon/authenticated grants on a few sensitive tables.
-- Sanity check that PostgREST hasn't been handed extra privileges beyond
-- what RLS assumes. Expected: empty or only very narrow SELECT grants.
-- ============================================================================
SELECT table_name, grantee, string_agg(privilege_type, ',') AS privileges
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon', 'authenticated')
   AND table_name IN (
     'profiles', 'vehicles', 'outreach_leads',
     'car_clubs', 'club_memberships', 'admin_audit_log'
   )
 GROUP BY table_name, grantee
 ORDER BY table_name, grantee;


-- ============================================================================
-- Query E — live definitions of helper functions called by RLS policies.
-- Paste each returned `body` verbatim into the audit file, wrapped in a
-- CREATE OR REPLACE FUNCTION block so the file is documentation-ready.
-- ============================================================================
SELECT proname, pg_get_functiondef(oid) AS body
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('is_admin', 'is_club_member', 'is_club_provider')
 ORDER BY proname;


-- ============================================================================
-- Query F — column defaults on public.profiles.
-- Used by 20260918c's BEFORE INSERT trigger to validate NEW.col IS NULL
-- OR NEW.col IS NOT DISTINCT FROM <default>. Re-run whenever the profiles
-- schema changes so the trigger's expectations stay accurate.
-- ============================================================================
SELECT a.attname,
       pg_get_expr(d.adbin, d.adrelid) AS default_expr
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE a.attrelid = 'public.profiles'::regclass
   AND a.attnum > 0
   AND NOT a.attisdropped
 ORDER BY a.attnum;
