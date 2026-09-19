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
-- state, and JS handlers landed in the two prior commits on this branch
-- (chore/remove-household). This migration drops the schema.
--
-- Apply AFTER the code merge goes live (per remaining-work-plan.md #6, "Jordan
-- applies 20260919a in the SQL editor after the code merge goes live, not
-- before"). Applying before deploy would break the still-live www/ callers
-- that hit .from('household_*') until the new bundle propagates.
--
-- FK check: `grep -rn "REFERENCES\s+household" supabase/migrations/` returned
-- zero results, so no known cross-table foreign keys reference households /
-- household_members / household_vehicle_access. Jordan is also running a
-- pg_constraint probe against prod (query provided in the PR description) to
-- catch any FKs that predate the migrations folder. If any surface, this
-- migration will grow a matching `ALTER TABLE ... DROP COLUMN` for each.
--
-- Idempotent: DROP POLICY IF EXISTS + DROP TABLE IF EXISTS. Safe to re-run.
-- Order matters: household_vehicle_access references household_id, so it
-- drops first; household_members references household_id, drops next;
-- households last.
--
-- If DROP TABLE fails with a dependency error (unknown cross-table FK), do
-- NOT reach for CASCADE — investigate what's referencing the table, add a
-- matching DROP COLUMN above, and re-run. CASCADE would silently drop
-- referencing columns' constraints and leave orphan columns behind.
-- ============================================================================


-- ---- 1. Drop RLS policies (idempotent) ----
-- Only 20260603g created policies on these tables (20260603h just added an
-- `email` column, no policies). Any prod-only policies get dropped by the
-- DROP TABLE below regardless.

DROP POLICY IF EXISTS "hva_owner_all"    ON public.household_vehicle_access;
DROP POLICY IF EXISTS "hva_member_select" ON public.household_vehicle_access;


-- ---- 2. Drop tables in dependency order ----

DROP TABLE IF EXISTS public.household_vehicle_access;
DROP TABLE IF EXISTS public.household_members;
DROP TABLE IF EXISTS public.households;
