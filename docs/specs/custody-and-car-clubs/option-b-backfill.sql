-- =============================================================================
-- Option B Backfill: create concierge_jobs for existing accepted packages
-- =============================================================================
-- PURPOSE:
--   The trigger in option-b-migration.sql only fires on future bid updates.
--   This one-time script creates concierge_jobs stub rows for the 10 packages
--   that were already in status='accepted'/'in_progress'/'completed' at the
--   time the migration was applied.
--
-- APPLY ORDER:
--   Paste option-b-migration.sql FIRST, then paste this file.
--
-- SAFE TO RE-RUN: ON CONFLICT (package_id) DO NOTHING makes this idempotent.
--   Running it twice creates no duplicates.
--
-- WHAT IT READS:
--   maintenance_packages.accepted_bid_id — set by acceptBid() in members.js
--     (line 7099: UPDATE maintenance_packages SET accepted_bid_id = bidId)
--   bids.provider_id — the provider whose bid was accepted
--   bids.price — converted to cents for total_price_cents
--
-- WHAT IT SKIPS:
--   - Packages with no accepted_bid_id (bid acceptance never recorded)
--   - Packages with no member_id (should not exist in practice)
--   - Packages that already have a concierge_jobs row (idempotent guard)
--
-- EXPECTED RESULT (prod as of 2026-05-29):
--   10 accepted/in_progress/completed packages, 0 of which have a job yet.
--   After backfill: all 10 should have a row. Verify with the coverage check
--   query at the bottom — it should return 0.
-- =============================================================================

INSERT INTO concierge_jobs (
  member_id,
  provider_id,
  package_id,
  member_vehicle_id,
  tier,
  scenario,
  status,
  total_price_cents,
  notes
)
SELECT
  mp.member_id,
  b.provider_id,
  mp.id,               -- package_id (the new column)
  mp.vehicle_id,       -- member_vehicle_id (nullable — safe if NULL)
  1,                   -- tier: 1 = standard stub (matches existing prod pattern)
  1,                   -- scenario: 1 = direct maintenance
  'scheduled',         -- allowed: draft|scheduled|in_progress|completed|cancelled
  ROUND(b.price * 100)::integer,
  'Backfill from Option B migration: bid ' || b.id::text
FROM maintenance_packages mp
JOIN bids b ON b.id = mp.accepted_bid_id
WHERE mp.status IN ('accepted', 'in_progress', 'completed')
  AND mp.accepted_bid_id IS NOT NULL
  AND mp.member_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM concierge_jobs cj WHERE cj.package_id = mp.id
  )
ON CONFLICT (package_id) DO NOTHING;


-- =============================================================================
-- COVERAGE CHECK — run immediately after the INSERT above
-- =============================================================================
-- Expected result: packages_still_missing_job = 0
-- If > 0: those packages have accepted_bid_id set but no bid row to JOIN to,
-- or the bid row's price is NULL (bids.price is NOT NULL so this shouldn't
-- happen). Investigate manually.
-- =============================================================================
SELECT count(*) AS packages_still_missing_job
FROM maintenance_packages mp
WHERE mp.status IN ('accepted', 'in_progress', 'completed')
  AND mp.accepted_bid_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM concierge_jobs cj WHERE cj.package_id = mp.id
  );
