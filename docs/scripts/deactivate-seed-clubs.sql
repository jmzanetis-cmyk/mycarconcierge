-- ============================================================================
-- Seed clubs cleanup — soft-deactivate Jordan's 3 dev seed clubs (per §1b).
--
-- Context: car_clubs currently has 3 seed rows from the 2026-05-26 seed
-- migration, all owned by Jordan (uid 8ea2bc19-…):
--   • Honda & Acura Club
--   • Truck & SUV Owners
--   • BMW Enthusiasts NJ
--
-- These are useful during Slice 3 build for testing provider-club.html
-- end-to-end as Jordan-as-provider. They MUST NOT be visible to a real
-- pilot member — Chris's club should be the only active club at Stage-2
-- flag-on.
--
-- Approach: soft delete via is_active=false rather than DELETE. Preserves
-- any dependent rows (club_memberships, club_points_ledger,
-- club_points_redemptions) that the ON DELETE CASCADE would otherwise blow
-- away if any test data got attached during the build phase. If you're
-- confident those tables are empty for the seed clubs, you can uncomment
-- the DELETE block at the bottom instead.
--
-- WHEN TO RUN: at Stage-2 flag-on time, immediately AFTER Chris's real
-- Alpha Auto Body club has been provisioned via provision-pilot-club.sql.
--
-- IDEMPOTENCY: safe to re-run. Rows already at is_active=false stay at
-- is_active=false.
-- ============================================================================

BEGIN;

-- Preview what will change. Uncomment on first run to confirm before writing.
-- SELECT id, name, provider_id, is_active, created_at
--   FROM public.car_clubs
--  WHERE provider_id = '<REPLACE_JORDAN_UID>'::uuid
--    AND name IN ('Honda & Acura Club', 'Truck & SUV Owners', 'BMW Enthusiasts NJ');

-- Soft-deactivate. Match by name AND provider_id so we don't accidentally
-- touch any club with a coincident name from a different provider.
UPDATE public.car_clubs
   SET is_active = false,
       updated_at = now()
 WHERE provider_id = '<REPLACE_JORDAN_UID>'::uuid   -- Jordan's uid
   AND name IN ('Honda & Acura Club', 'Truck & SUV Owners', 'BMW Enthusiasts NJ')
RETURNING id, name, is_active;

COMMIT;

-- ============================================================================
-- Post-cleanup verification — should show ONE active club (Chris's) and
-- three inactive seed clubs (or zero seed clubs if a prior run already
-- deactivated them).
-- ============================================================================

-- 1. All active clubs across prod. Expect exactly one row (Chris's club).
SELECT id, name, provider_id, is_active, created_at
  FROM public.car_clubs
 WHERE is_active = true
 ORDER BY created_at;

-- 2. The three seed clubs should be inactive. Confirms the UPDATE landed.
SELECT id, name, provider_id, is_active
  FROM public.car_clubs
 WHERE name IN ('Honda & Acura Club', 'Truck & SUV Owners', 'BMW Enthusiasts NJ')
 ORDER BY name;

-- ============================================================================
-- HARDER OPTION — delete outright.
-- Only use this if you've confirmed the three seed clubs have zero rows in
-- club_memberships, club_points_ledger, club_points_redemptions,
-- club_reward_rules. The FK cascades will blow those rows away otherwise.
-- ============================================================================

-- BEGIN;
-- DELETE FROM public.car_clubs
--  WHERE provider_id = '<REPLACE_JORDAN_UID>'::uuid
--    AND name IN ('Honda & Acura Club', 'Truck & SUV Owners', 'BMW Enthusiasts NJ')
-- RETURNING id, name;
-- COMMIT;
