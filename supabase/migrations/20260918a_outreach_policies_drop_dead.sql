-- ============================================================================
-- Task #470 — Version-control catch-up: drop the stale service_role_*
-- policy names from 20260420_outreach_engine_initial.sql.
--
-- Background: 20260420_outreach_engine_initial.sql CREATE'd seven policies
-- (`service_role_engine_state`, `service_role_pipeline`, `service_role_leads`,
-- `service_role_messages`, `service_role_campaigns`, `service_role_campaign_leads`,
-- `service_role_activity_log`) as `FOR ALL USING (true) WITH CHECK (true)`
-- with no `TO` clause — which would have applied to anon+authenticated,
-- opening the outreach tables (prospect names, emails, phones, campaign
-- state) to any signed-in user with the public anon key.
--
-- Task #469's live pg_policies capture (docs/audit/2026-09-18-live-rls-state.sql,
-- section 2) confirms these policies are NOT present in prod. All seven
-- outreach tables have RLS enabled with zero policies — meaning they're
-- already service-role only. The 20260420 CREATE POLICY statements were
-- either never applied to prod (Supabase SQL editor was used before this
-- codebase started tracking migrations) or were dropped out-of-band.
--
-- This migration codifies that state:
--   * DROP POLICY IF EXISTS is idempotent — no-op today, catches any
--     future accidental re-creation from a rebuilt or restored environment
--     where the 20260420 statements did land.
--   * The rls-policy-shape.test.js lockdown test asserts the pattern
--     `service_role_*` CREATE POLICY without `TO service_role` cannot
--     re-enter the migrations folder, catching this at PR time.
--
-- Also see the header comment on 20260420_outreach_engine_initial.sql
-- pointing here.
-- ============================================================================

DROP POLICY IF EXISTS "service_role_engine_state"      ON public.engine_state;
DROP POLICY IF EXISTS "service_role_pipeline"          ON public.opportunity_pipeline;
DROP POLICY IF EXISTS "service_role_leads"             ON public.outreach_leads;
DROP POLICY IF EXISTS "service_role_messages"          ON public.outreach_messages;
DROP POLICY IF EXISTS "service_role_campaigns"         ON public.outreach_campaigns;
DROP POLICY IF EXISTS "service_role_campaign_leads"    ON public.campaign_leads;
DROP POLICY IF EXISTS "service_role_activity_log"      ON public.outreach_activity_log;
