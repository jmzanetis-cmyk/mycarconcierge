-- ============================================================================
-- Task from remaining-work-plan.md item #6 — Drop the Household feature.
--
-- Background: Household was a family-sharing feature (vehicles, invitations,
-- roles, spending limits). Prod probe on 2026-09-18 returned 0 rows across
-- every metric:
--   * households: 0
--   * household_members: 0 (active + pending)
--   * household_vehicle_access: 0
--   * activity in the last 7 days: 0
-- No data to preserve. The feature code, nav item, section markup, modals,
-- state, and JS handlers landed in the two commits on chore/remove-household.
-- This migration drops the schema.
--
-- Apply AFTER the code merge goes live (per remaining-work-plan.md #6, "Jordan
-- applies 20260919a in the SQL editor after the code merge goes live, not
-- before"). Applying before deploy would break the still-live www/ callers
-- that hit .from('household_*') until the new bundle propagates.
--
-- FK check (2026-09-18): grep of migrations returned zero cross-table FKs to
-- households / household_members / household_vehicle_access. Jordan also
-- ran a pg_constraint probe against prod (same day), which returned 0 rows —
-- no unknown FK references. Safe to drop tables directly.
--
-- SUPABASE STUDIO POLICY HISTORY (2026-09-19 lesson learned):
--   Earlier revisions of this migration named the RLS policies to drop
--   explicitly:
--       DROP POLICY IF EXISTS "hva_owner_all"    ON public.household_vehicle_access;
--       DROP POLICY IF EXISTS "hva_member_select" ON public.household_vehicle_access;
--   Those were the only policies captured in supabase/migrations/ (from
--   20260603g). When applied against prod, the migration surfaced additional
--   policies that had been created directly in the Supabase Studio UI and
--   never landed in a tracked migration — notably `hh_member_select` on
--   household_members. `DROP TABLE` blocked on those Studio-created policies
--   even though the file had already run its explicit DROP POLICYs.
--
--   Fix: enumerate every policy on the three tables at apply-time via a DO
--   loop against pg_policies, then drop the tables. This handles both known
--   (migration-tracked) and unknown (Studio-created, prod-only) policies
--   uniformly and stays idempotent — the loop is a no-op on any environment
--   where the tables have already been dropped.
--
-- Order matters: household_vehicle_access references household_id, so it
-- drops first; household_members references household_id, drops next;
-- households last. DROP TABLE IF EXISTS is idempotent.
-- ============================================================================


-- ---- 1. Drop every policy on the three tables (idempotent, drift-tolerant) ----
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'household_vehicle_access',
         'household_members',
         'households'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- ---- 2. Drop tables in dependency order ----
DROP TABLE IF EXISTS public.household_vehicle_access;
DROP TABLE IF EXISTS public.household_members;
DROP TABLE IF EXISTS public.households;
