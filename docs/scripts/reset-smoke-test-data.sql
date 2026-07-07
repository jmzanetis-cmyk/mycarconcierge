-- ============================================================================
-- Smoke-test reset harness — restore a pilot club to "provisioned but zero
-- activity" so the §6a Stage-1 → Stage-2 verification protocol can be
-- re-run cleanly, including after a mid-run failure that leaves partial data.
--
-- What this DOES restore:
--   • club_points_redemptions rows (voucher rows) for (club, member) → deleted
--   • club_points_ledger rows      (punch + redeem deltas) for (club, member) → deleted
--   • club_memberships rows        (the join edge) for (club, member) → HARD deleted
--   • car_clubs.member_count       decremented by the number of membership rows deleted
--
-- What this DOES NOT restore (deliberate — reset returns to "provisioned but
-- zero activity", NOT "unprovisioned"):
--   • car_clubs row for the club
--   • club_reward_rules row(s) for the club
--   • club_rewards row(s) for the club
--   • platform_settings flag posture (enabled + test_users)
--   • auth.users / profiles rows for any user
--
-- FK topology (verified against 20260703b + 20260703h):
--   Every table below references car_clubs(id) ON DELETE CASCADE and
--   auth.users(id) (no cascade). NONE of the three delete-target tables
--   reference each other, so FK order among them is free. Logical order
--   used below is voucher rows → ledger rows → membership rows because
--   that's the reverse of how the smoke test creates them (audit-friendly
--   for anyone tracing through logs).
--
-- Membership: HARD DELETE decided (not soft delete via is_active=false).
-- Reason: joinClub at car-clubs.js:319-341 has two code paths:
--   • Reactivation (existing soft-deleted row): UPDATE is_active=true only
--   • Fresh insert (no row):                     INSERT + member_count += 1
-- A real first-time customer hits the fresh-insert path. To keep re-runs of
-- the smoke test testing THAT path (not the reactivation path a repeat
-- customer would hit), the reset hard-deletes the membership.
--
-- member_count drift: fresh join increments car_clubs.member_count; without a
-- decrement in the reset, that counter drifts by +1 per smoke-test cycle.
-- This DO block counts memberships-actually-deleted and decrements
-- accordingly, using GREATEST(..., 0) to prevent going negative if something
-- weird has happened to the counter.
--
-- Inventory: Chris's club_rewards row has inventory_qty = NULL (unlimited),
-- so the RPC's Step 6c inventory decrement is skipped and no restore is
-- needed. For future pilot providers with FINITE inventory, add an inventory
-- restore step (see the commented block at the bottom).
--
-- IDEMPOTENCY: safe to re-run. DELETEs on an already-empty table affect zero
-- rows; the member_count decrement is skipped when zero memberships were
-- deleted; the verification queries still return 0/0/0.
--
-- NO BEGIN/COMMIT WRAPPER: multi-statement atomicity lives in the DO block
-- (plpgsql implicit transaction), which is foolproof against Studio's
-- SQL-editor quirks with outer transaction markers. Lesson from 2026-07-06's
-- seed-cleanup incident preserved.
--
-- USAGE: paste into Supabase Studio SQL Editor and run. The DO block
-- executes atomically; then the three verification COUNT queries run
-- separately and should all show 0.
-- ============================================================================

DO $$
DECLARE
  -- ↓↓↓ PARAMETERS — swap for a different pilot provider or test member ↓↓↓
  v_club_id     uuid := 'fee6de4f-de82-4c73-8097-5392007302d1';  -- Chris's club (Alpha Auto Body Rewards)
  v_member_id   uuid := '8ea2bc19-16c7-4af2-8d4d-551434a53ec7';  -- Jordan (internal tester)
  -- ↑↑↑ PARAMETERS ↑↑↑

  v_voucher_rows       int;
  v_ledger_rows        int;
  v_membership_rows    int;
BEGIN
  -- 1. Voucher rows first (deleted from club_points_redemptions).
  --    Both club_id AND member_id predicates — cannot touch another club's
  --    or another member's rows.
  DELETE FROM public.club_points_redemptions
   WHERE club_id  = v_club_id
     AND member_id = v_member_id;
  GET DIAGNOSTICS v_voucher_rows = ROW_COUNT;

  -- 2. Ledger rows (deleted from club_points_ledger). Same dual-predicate
  --    scoping.
  DELETE FROM public.club_points_ledger
   WHERE club_id  = v_club_id
     AND member_id = v_member_id;
  GET DIAGNOSTICS v_ledger_rows = ROW_COUNT;

  -- 3. Membership rows — HARD delete (see header for rationale).
  DELETE FROM public.club_memberships
   WHERE club_id  = v_club_id
     AND member_id = v_member_id;
  GET DIAGNOSTICS v_membership_rows = ROW_COUNT;

  -- 4. If any memberships were deleted, decrement car_clubs.member_count by
  --    the same count to prevent drift across smoke-test cycles. GREATEST
  --    guard prevents going negative if the counter is somehow already low.
  IF v_membership_rows > 0 THEN
    UPDATE public.car_clubs
       SET member_count = GREATEST(COALESCE(member_count, 0) - v_membership_rows, 0),
           updated_at   = now()
     WHERE id = v_club_id;
  END IF;

  RAISE NOTICE 'Reset complete for club=% member=%: % voucher rows, % ledger rows, % membership rows deleted; member_count decremented by %.',
    v_club_id, v_member_id,
    v_voucher_rows, v_ledger_rows, v_membership_rows,
    v_membership_rows;
END $$;

-- ============================================================================
-- Verification — self-confirm the reset achieved 0/0/0. Same three COUNTs
-- as §6a's precondition check (c), so re-run confirms the smoke test can
-- start from a clean state.
--
-- If any of these return > 0, either:
--   • the parameters at the top don't match Chris's club/member (typo)
--   • a concurrent process wrote new rows between the DO block and the SELECTs
--   • some rows exist under different member_id (another tester) — safe to
--     ignore for §6a purposes; the reset only cleared THIS member's rows
-- ============================================================================

-- NOTE: the parameter substitution below must match the DO block above.
-- If you edited the DO-block parameters, edit these too.
SELECT 'club_memberships'         AS tbl,
       COUNT(*)                   AS row_count_for_this_member
  FROM public.club_memberships
 WHERE club_id  = 'fee6de4f-de82-4c73-8097-5392007302d1'::uuid
   AND member_id = '8ea2bc19-16c7-4af2-8d4d-551434a53ec7'::uuid
UNION ALL
SELECT 'club_points_ledger'       AS tbl,
       COUNT(*)                   AS row_count_for_this_member
  FROM public.club_points_ledger
 WHERE club_id  = 'fee6de4f-de82-4c73-8097-5392007302d1'::uuid
   AND member_id = '8ea2bc19-16c7-4af2-8d4d-551434a53ec7'::uuid
UNION ALL
SELECT 'club_points_redemptions'  AS tbl,
       COUNT(*)                   AS row_count_for_this_member
  FROM public.club_points_redemptions
 WHERE club_id  = 'fee6de4f-de82-4c73-8097-5392007302d1'::uuid
   AND member_id = '8ea2bc19-16c7-4af2-8d4d-551434a53ec7'::uuid;

-- Sanity check on member_count — should equal the number of ACTIVE memberships
-- in the club after reset (probably 0 for Chris's pilot club with only Jordan
-- as the test member; higher for a live pilot).
SELECT c.id, c.name, c.member_count AS cached_count,
       (SELECT COUNT(*)
          FROM public.club_memberships
         WHERE club_id = c.id
           AND is_active = true)  AS live_active_count
  FROM public.car_clubs c
 WHERE c.id = 'fee6de4f-de82-4c73-8097-5392007302d1'::uuid;
-- Interpretation:
--   • cached_count vs live_active_count should match after a clean reset.
--   • If they differ, the denormalized counter has drifted from truth (§9a
--     debt entry: "member_count should be a DB trigger or computed-on-read").
--     Not blocking for smoke tests; log for post-pilot cleanup.

-- ============================================================================
-- OPTIONAL — inventory restore for FUTURE pilot providers with finite inventory.
-- Chris's Free Oil Change reward has inventory_qty=NULL (unlimited), so this
-- block does nothing for the current pilot and is left commented out.
--
-- If a future pilot provider has a finite-inventory reward that got
-- decremented by test redemptions, restore it by adding back the number of
-- deleted voucher rows for that reward. Substitute the reward_id and count
-- before uncommenting.
-- ============================================================================

-- UPDATE public.club_rewards
--    SET inventory_qty = inventory_qty + <NUMBER_OF_VOUCHERS_DELETED>
--  WHERE id = '<REWARD_UUID_WITH_FINITE_INVENTORY>'::uuid
-- RETURNING id, title, inventory_qty;
