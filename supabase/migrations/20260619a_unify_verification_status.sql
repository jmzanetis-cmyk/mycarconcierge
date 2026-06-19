-- ============================================================================
-- 20260619a_unify_verification_status.sql
--
-- Adds profiles.verification_status (the admin-managed bid-eligibility flag
-- referenced by the application code but never created in any tracked
-- migration), and reconciles plan_bids / care_plans / vehicle_photos RLS to
-- gate on the same unified expression:
--
--   role = 'admin'
--   OR (role = 'provider' AND verification_status = 'verified'
--                         AND suspended_at IS NULL)
--
-- BACKGROUND (2026-06-19 prod probe):
--   The earlier file 20260328_job_board.sql defines policies named
--     "Verified providers select/write own bids"
--     "Providers view open care plans"
--     "Providers view photos for open plans"
--   referencing profiles.verification_status. But profiles has no such column
--   in prod, and the deployed plan_bids / care_plans / vehicle_photos
--   policies do NOT match the file — they have different names and different
--   USING expressions:
--
--     plan_bids:      "Providers can manage own bids"
--                       FOR ALL USING (provider_id = auth.uid())
--                     "Members can view bids on their care plans"
--     care_plans:     "Members can manage own care plans"
--                     "cp_select_approved_provider"
--                       USING (status='open' AND provider in provider_applications
--                              WHERE status='approved')
--     vehicle_photos: "Members can manage own vehicle photos"
--                     "Providers can view vehicle photos for open care plans"
--
--   So 20260328 was either skipped or overridden by direct SQL. This migration
--   is the canonical reconciliation: DROP the deployed provider policies (plus
--   the file-named variants in case they exist anywhere), add the missing
--   column, then CREATE the unified verified-provider policies.
--
-- KEEPS (untouched):
--   plan_bids       "Members can view bids on their care plans"
--   care_plans      "Members can manage own care plans"
--   vehicle_photos  "Members can manage own vehicle photos"
--
-- NOT added: a service_role policy. service_role bypasses RLS by definition;
-- adding one would be redundant and just enlarge the policy list to audit.
--
-- IDEMPOTENT:
--   ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT
--   DROP POLICY IF EXISTS / CREATE POLICY
-- Safe to re-run.
-- ============================================================================


-- ─── 1. Add profiles.verification_status ───────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT;

COMMENT ON COLUMN profiles.verification_status IS
  'Admin-managed bid-eligibility state. '
  'NULL = unverified (default for existing rows). '
  '''pending'' = admin review queued. '
  '''verified'' = admin-approved to place bids on care_plans. '
  '''rejected'' = explicitly denied. '
  'Checked by plan_bids / care_plans / vehicle_photos RLS and by the '
  '/api/plan-bids endpoint. Set by the admin Verify Provider action '
  '(Step 1b of the 2026-06-19 build plan).';

-- Optional but on by default: enforce the value set. Re-runnable via DROP-then-ADD.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_verification_status_chk;
ALTER TABLE profiles ADD CONSTRAINT profiles_verification_status_chk
  CHECK (verification_status IS NULL
         OR verification_status IN ('pending', 'verified', 'rejected'));


-- ─── 2. plan_bids — unified verified-provider policies ─────────────────────
-- Drop the deployed provider policy + any file-named variants:
DROP POLICY IF EXISTS "Providers can manage own bids"           ON plan_bids;
DROP POLICY IF EXISTS "Verified providers select own bids"      ON plan_bids;
DROP POLICY IF EXISTS "Verified providers write own bids"       ON plan_bids;
DROP POLICY IF EXISTS "Verified providers can manage own bids"  ON plan_bids;
DROP POLICY IF EXISTS "Verified providers can view own bids"    ON plan_bids;

-- Write policy (covers INSERT, UPDATE, DELETE — and incidentally SELECT, but
-- the explicit SELECT policy below makes the read intent obvious to anyone
-- auditing pg_policy):
CREATE POLICY "Verified providers can manage own bids" ON plan_bids
  FOR ALL
  USING (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'provider'
              AND verification_status = 'verified'
              AND suspended_at IS NULL)
        )
    )
  )
  WITH CHECK (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'provider'
              AND verification_status = 'verified'
              AND suspended_at IS NULL)
        )
    )
  );

CREATE POLICY "Verified providers can view own bids" ON plan_bids
  FOR SELECT
  USING (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'provider'
              AND verification_status = 'verified'
              AND suspended_at IS NULL)
        )
    )
  );

-- INTENTIONALLY KEPT (not dropped, not recreated):
--   "Members can view bids on their care plans" — member-side visibility.


-- ─── 3. care_plans — unified verified-provider browse policy ───────────────
-- Drop the deployed provider policy + any file-named variants:
DROP POLICY IF EXISTS "cp_select_approved_provider"                 ON care_plans;
DROP POLICY IF EXISTS "Providers view open care plans"              ON care_plans;
DROP POLICY IF EXISTS "Verified providers can view open care plans" ON care_plans;

CREATE POLICY "Verified providers can view open care plans" ON care_plans
  FOR SELECT
  USING (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'provider'
              AND verification_status = 'verified'
              AND suspended_at IS NULL)
        )
    )
  );

-- INTENTIONALLY KEPT (not dropped, not recreated):
--   "Members can manage own care plans" — member ownership.


-- ─── 4. vehicle_photos — unified verified-provider view policy ─────────────
-- The provider read path is scoped to vehicles attached to an OPEN care_plan
-- (a verified provider reviewing what the member's bidding job involves).
-- The member-owner branch (member_id = auth.uid()) is duplicated here so a
-- single permissive policy covers both legitimate readers; the existing
-- "Members can manage own vehicle photos" still covers member writes too.
DROP POLICY IF EXISTS "Providers can view vehicle photos for open care plans"           ON vehicle_photos;
DROP POLICY IF EXISTS "Providers view photos for open plans"                            ON vehicle_photos;
DROP POLICY IF EXISTS "Verified providers can view vehicle photos for open care plans"  ON vehicle_photos;

CREATE POLICY "Verified providers can view vehicle photos for open care plans" ON vehicle_photos
  FOR SELECT
  USING (
    member_id = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM care_plans cp
        WHERE cp.vehicle_id = vehicle_photos.vehicle_id
          AND cp.status = 'open'
      )
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND (
            role = 'admin'
            OR (role = 'provider'
                AND verification_status = 'verified'
                AND suspended_at IS NULL)
          )
      )
    )
  );

-- INTENTIONALLY KEPT (not dropped, not recreated):
--   "Members can manage own vehicle photos" — member ownership.
