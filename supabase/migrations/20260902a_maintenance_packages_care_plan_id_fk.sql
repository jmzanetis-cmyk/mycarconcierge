-- ============================================================================
-- 20260902a — maintenance_packages: add care_plan_id FK to care_plans.
--
-- Fast-follow to 20260901a (upsell backend). The two tables have always been
-- dual-written by savePackage() but there was no real FK between them —
-- resolveCarePlanId() had to join by (member_id, title), which is fragile.
-- Ambiguity-safe fallback exists but a real FK is the durable fix.
--
-- Purely additive:
--   - Nullable column, no default → no rows change.
--   - No backfill in this migration; savePackage() (client change in the same
--     PR) starts capturing the care_plans insert id and writing it going
--     forward. Historical rows continue to resolve via the (member_id, title)
--     fallback in resolveCarePlanId().
--   - ON DELETE SET NULL matches other cross-table FKs in this schema (see
--     care_plans_accepted_bid_id_fkey, care_plans_provider_id_fkey).
--
-- Coverage baseline (verified 2026-09-01, and re-verified before this
-- migration): zero currently-active jobs would benefit or be harmed by the
-- FK addition — all 12 "accepted" maintenance_packages rows are stale test
-- data with no work_started_at, all 7 care_plans in escrow-active states
-- are test data with no maintenance_packages twin. Real dual-write pattern
-- resumed 2026-08-28 (commit 0abb698) and any new job will populate the FK
-- on creation.
-- ============================================================================
BEGIN;

ALTER TABLE maintenance_packages
  ADD COLUMN IF NOT EXISTS care_plan_id uuid REFERENCES care_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maintenance_packages_care_plan_id_idx
  ON maintenance_packages (care_plan_id);

COMMIT;

-- ============================================================================
-- POST-APPLY SMOKE (manual):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='maintenance_packages'
--      AND column_name='care_plan_id';
--   -- Expect: care_plan_id | uuid | YES (nullable)
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename='maintenance_packages'
--      AND indexname='maintenance_packages_care_plan_id_idx';
--   -- Expect: one row.
-- ============================================================================
