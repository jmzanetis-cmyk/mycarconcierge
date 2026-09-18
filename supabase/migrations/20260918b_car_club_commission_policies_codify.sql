-- ============================================================================
-- Task #471 — Codify the live RLS state for the twelve Tier-0.5 audit tables.
--
-- Background: the original audit note (docs/claude-code-tasks.md #471)
-- assumed the twelve tables had NO RLS. Task #469's live capture
-- (docs/audit/2026-09-18-live-rls-state.sql) shows the actual state:
--
--   * All twelve tables have RLS enabled in prod (someone applied a
--     direct-to-prod enable between the audit draft and the Task #469
--     capture; the specific migration is not in this repo).
--   * Nine of the twelve have zero policies (service-role only, matching
--     the audit's stated design):
--         club_activity_log, club_reward_rules, car_club_benefits,
--         car_club_redemptions, car_club_return_bonuses, community_posts,
--         founder_campaign_clicks, founder_campaign_investments,
--         admin_audit_log
--     RLS-on with no policies is intentional — service_role bypasses RLS,
--     browser callers get nothing. No CREATE POLICY needed for these.
--   * Three tables have SELECT/INSERT policies that were also created
--     directly on prod, outside the migrations folder:
--         car_clubs, club_memberships, commission_rate_history
--     Section below pulls those into version control verbatim so a
--     rebuild or restore reproduces prod behavior.
--
-- This migration is idempotent against prod:
--   * ALTER TABLE ENABLE ROW LEVEL SECURITY is a no-op on tables that
--     already have RLS on (which all twelve do).
--   * DROP POLICY IF EXISTS + CREATE POLICY replaces any existing policy
--     with the exact live definition. Safe to re-run.
--
-- The car_clubs and club_memberships policies call helper functions
-- (public.is_club_member, public.is_club_provider) that also live only
-- in prod. Their bodies are recorded verbatim in
-- docs/audit/2026-09-18-live-rls-state.sql, section 7. They are NOT
-- re-created here — this migration calls them as-is. Both are SECURITY
-- DEFINER + STABLE + SET search_path = 'public'.
--
-- Task #472 will move the browser writes on car_clubs from
-- www/admin-ai-ops.js into an admin-authenticated Netlify function. Once
-- #472 lands, this migration's read-only policies are the complete
-- browser surface — every write on car_clubs / club_memberships goes
-- through the service-role client server-side, matching the "no policies
-- for the nine other tables" shape.
-- ============================================================================


-- ---- 1. ENABLE RLS on the twelve audit tables (idempotent, tolerates
--         tables that are absent from prod) ------------------------------
--
-- First applied 2026-09-18: relation public.founder_campaign_clicks does
-- not exist in prod — the 20260319_crowd_fund_complete.sql tables were
-- never applied, or were dropped out-of-band. Straight ALTER TABLE fails
-- the whole migration on the first missing table. Loop over the list,
-- skip missing tables with a NOTICE. Live absences are recorded in
-- docs/audit/2026-09-18-live-rls-state.sql, section 1.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'car_clubs',
    'club_memberships',
    'club_activity_log',
    'club_reward_rules',
    'car_club_benefits',
    'car_club_redemptions',
    'car_club_return_bonuses',
    'community_posts',
    'commission_rate_history',
    'founder_campaign_clicks',
    'founder_campaign_investments',
    'admin_audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    ELSE
      RAISE NOTICE 'skipping RLS enable: table public.% is absent from this environment', t;
    END IF;
  END LOOP;
END $$;


-- ---- 2. car_clubs — three SELECT policies --------------------------------

-- Discovery read: any authenticated caller sees active, non-suspended clubs.
DROP POLICY IF EXISTS car_clubs_discovery_read ON public.car_clubs;
CREATE POLICY car_clubs_discovery_read ON public.car_clubs
  FOR SELECT
  USING ((is_active IS NOT FALSE) AND (provider_suspended IS NOT TRUE));

-- Member read: caller is a member of this club (via is_club_member helper).
DROP POLICY IF EXISTS car_clubs_member_read ON public.car_clubs;
CREATE POLICY car_clubs_member_read ON public.car_clubs
  FOR SELECT
  USING (public.is_club_member(id, auth.uid()));

-- Provider read: caller owns this club.
DROP POLICY IF EXISTS car_clubs_provider_read ON public.car_clubs;
CREATE POLICY car_clubs_provider_read ON public.car_clubs
  FOR SELECT
  USING (provider_id = auth.uid());


-- ---- 3. club_memberships — two SELECT policies ---------------------------

-- Provider read: caller owns the club this membership belongs to.
DROP POLICY IF EXISTS club_memberships_provider_read ON public.club_memberships;
CREATE POLICY club_memberships_provider_read ON public.club_memberships
  FOR SELECT
  USING (public.is_club_provider(club_id, auth.uid()));

-- Self read.
DROP POLICY IF EXISTS club_memberships_self_read ON public.club_memberships;
CREATE POLICY club_memberships_self_read ON public.club_memberships
  FOR SELECT
  USING (member_id = auth.uid());


-- ---- 4. commission_rate_history — admin-only SELECT + INSERT -------------

DROP POLICY IF EXISTS "Admins can view commission rate history" ON public.commission_rate_history;
CREATE POLICY "Admins can view commission rate history" ON public.commission_rate_history
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert commission rate history" ON public.commission_rate_history;
CREATE POLICY "Admins can insert commission rate history" ON public.commission_rate_history
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin')
  );
