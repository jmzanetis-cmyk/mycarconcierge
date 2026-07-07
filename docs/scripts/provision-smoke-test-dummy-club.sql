-- ============================================================================
-- Smoke-test dummy-provider club provisioning.
--
-- Purpose: stage a fresh, throwaway Car Club under the dummy provider
-- testprovider@test.com (uid 0bb98854-8aa8-41f7-816b-d06785167194) so the
-- §6a Stage-1 → Stage-2 verification protocol can be driven against a
-- provider that is NOT Chris (whose Alpha Auto Body Rewards is production)
-- and NOT Jordan's dual-role uid (whose member/provider overlap breaks the
-- cross-account punch test).
--
-- Mirrors the exact SHAPE of Chris's provisioning (car_clubs +
-- club_reward_rules) with one addition: also inserts the club_rewards
-- catalog row that was missing from Chris's provisioning — the gap where
-- listRewards/redeem_reward_for_member both read from club_rewards but
-- club_reward_rules-only clubs have no reward to redeem. For the smoke test
-- we need the redeem flow to actually work.
--
-- Column references (verified against migrations):
--   car_clubs           — 20260703a:1-23
--   club_rewards        — 20260703h:120-131  (kind enum values 20260703h:58)
--   club_reward_rules   — 20260703d:1-13     (column is is_active, NOT active)
--   platform_settings   — Replit-era, JSON-shaped
--
-- Idempotency:
--   • Section A (flag allowlist): FULLY idempotent. Uses jsonb @> containment
--     check before append. Re-running preserves Jordan's uid and does NOT
--     add a duplicate for the dummy provider.
--   • Sections B–D (INSERTs): NOT idempotent. Re-running would create a
--     second club under the dummy provider. Fine for our purposes — this
--     script runs once for staging; subsequent smoke-test cycles use
--     docs/scripts/reset-smoke-test-data.sql to wipe activity WITHOUT
--     touching the club/reward/rules rows themselves. The DO block emits a
--     NOTICE if a prior club already exists so an accidental double-run is
--     visible in Studio's Notices tab.
--
-- Discipline:
--   • No BEGIN/COMMIT wrapper (Studio auto-commit quirk from 2026-07-06
--     seed-cleanup incident — multi-statement atomicity lives in the DO
--     block's plpgsql implicit transaction).
--   • Every INSERT/UPDATE is scoped to the dummy provider or the new club.
--     Nothing addresses Chris's provider_id, his club fee6de4f-…, his
--     club_rewards row 4dd1930e-…, his rules row, or any other provider.
--
-- Usage: paste the whole file into Supabase Studio → SQL Editor → Run. Read
-- the RAISE NOTICE messages to get the new club_id and club_rewards.id, and
-- verify the SELECTs at the bottom.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION A — FLAG ALLOWLIST
-- Append 0bb98854-… to platform_settings.car_club_programs_enabled.test_users
-- WITHOUT dropping any existing entries. Idempotent via jsonb @> containment
-- check.
-- ────────────────────────────────────────────────────────────────────────────

-- A.1 — BEFORE snapshot. Confirm Jordan (8ea2bc19-…) and Chris (dbb15523-…)
-- are already present. If dummy provider is present here, the UPDATE below
-- is a no-op — which is exactly the idempotency guarantee we want.
SELECT setting_value->'enabled'    AS flag_enabled,
       setting_value->'test_users' AS test_users_before
  FROM public.platform_settings
 WHERE setting_key = 'car_club_programs_enabled';

-- A.2 — Append (idempotent). If the uid is already in the array, the CASE
-- expression returns the existing array unchanged. If not, the uid is
-- appended as a jsonb string element.
UPDATE public.platform_settings
   SET setting_value = jsonb_set(
     setting_value,
     '{test_users}',
     CASE
       WHEN COALESCE(setting_value->'test_users', '[]'::jsonb)
              @> to_jsonb('0bb98854-8aa8-41f7-816b-d06785167194'::text)
         THEN COALESCE(setting_value->'test_users', '[]'::jsonb)
       ELSE COALESCE(setting_value->'test_users', '[]'::jsonb)
              || to_jsonb('0bb98854-8aa8-41f7-816b-d06785167194'::text)
     END
   )
 WHERE setting_key = 'car_club_programs_enabled';

-- A.3 — AFTER snapshot. Expect: enabled=false (unchanged), test_users
-- includes Jordan, Chris, and dummy provider (three uids). Eyeball this
-- carefully — Jordan's uid must still be present.
SELECT setting_value->'enabled'    AS flag_enabled,
       setting_value->'test_users' AS test_users_after
  FROM public.platform_settings
 WHERE setting_key = 'car_club_programs_enabled';


-- ────────────────────────────────────────────────────────────────────────────
-- SECTIONS B + C + D — CLUB, CLUB_REWARDS, CLUB_REWARD_RULES
--
-- One DO block so club_id from Section B's RETURNING is available for
-- Sections C and D without cross-statement variable passing. RAISE NOTICE
-- emits all three new IDs so you can capture them for the smoke test.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_provider_uid uuid := '0bb98854-8aa8-41f7-816b-d06785167194';  -- dummy: testprovider@test.com
  v_club_name    text := 'Test Auto Shop Rewards';
  v_club_desc    text := 'Smoke-test provider club — not for real customers.';
  v_reward_title text := 'Free Oil Change';
  v_reward_desc  text := 'Smoke-test reward. Redeem for a free oil change.';
  v_punches      int  := 10;
  v_theme_color  text := '#C9A84C';  -- match Chris's theme color; harmless

  v_club_id   uuid;
  v_reward_id uuid;
  v_rule_id   uuid;
BEGIN
  -- Non-blocking warning if the dummy provider already owns a club.
  -- Preserves the safety property that an accidental double-run is
  -- visible in Notices without failing hard.
  IF EXISTS (SELECT 1 FROM public.car_clubs WHERE provider_id = v_provider_uid) THEN
    RAISE NOTICE 'NOTE: provider % already owns >= 1 car_club. This run will create ANOTHER — abort if unintended.', v_provider_uid;
  END IF;

  -- SECTION B — car_clubs
  -- Feature toggles mirror Chris's row (punch_card only). is_active=true so
  -- the club appears in listMyClubs / listMyProviderClubs.
  INSERT INTO public.car_clubs (
    provider_id,
    name,
    description,
    is_active,
    provider_suspended,
    theme_color,
    punch_card_enabled,
    points_enabled,
    coupons_enabled,
    comp_services_enabled
  ) VALUES (
    v_provider_uid,
    v_club_name,
    v_club_desc,
    true,
    false,
    v_theme_color,
    true,
    false,
    false,
    false
  )
  RETURNING id INTO v_club_id;

  -- SECTION C — club_rewards
  -- The spend-side catalog row that Chris's provisioning was missing.
  -- kind='comp_service' matches the semantic (Free Oil Change = comped
  -- service the shop provides, not a merch item). point_cost=10 matches
  -- punches_required below so 10 punches earn exactly one redemption.
  -- inventory_qty=NULL = unlimited (RPC step 6c skips decrement when NULL).
  INSERT INTO public.club_rewards (
    club_id,
    kind,
    title,
    description,
    point_cost,
    inventory_qty,
    active
  ) VALUES (
    v_club_id,
    'comp_service',
    v_reward_title,
    v_reward_desc,
    10,
    NULL,
    true
  )
  RETURNING id INTO v_reward_id;

  -- SECTION D — club_reward_rules
  -- The earn-side rule. Column is is_active (NOT active) — different from
  -- club_rewards; easy to trip over.
  INSERT INTO public.club_reward_rules (
    club_id,
    reward_name,
    reward_description,
    punches_required,
    reward_type,
    is_active
  ) VALUES (
    v_club_id,
    v_reward_title,
    v_reward_desc,
    v_punches,
    'punch_card',
    true
  )
  RETURNING id INTO v_rule_id;

  RAISE NOTICE '─── Provisioning complete ─────────────────────────────────────';
  RAISE NOTICE 'club_id       = %', v_club_id;
  RAISE NOTICE 'club_rewards  = %  (title=%, point_cost=10, kind=comp_service)', v_reward_id, v_reward_title;
  RAISE NOTICE 'reward_rule   = %  (punches_required=%)', v_rule_id, v_punches;
  RAISE NOTICE 'provider_uid  = %', v_provider_uid;
  RAISE NOTICE '───────────────────────────────────────────────────────────────';
  RAISE NOTICE 'Save club_id and club_rewards ID — they REPLACE fee6de4f-… and 4dd1930e-… for the rest of the smoke test.';
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION E — VERIFICATION
-- Confirm the club, reward, rule, and the three precondition COUNTs are as
-- expected. Substitute the new club_id from the NOTICE output above into the
-- final three COUNT queries.
-- ────────────────────────────────────────────────────────────────────────────

-- E.1 — Dummy provider should own exactly one active punch_card_enabled club
-- (or more if this was a re-run; see the DO-block NOTICE for the newest id).
SELECT id, name, provider_id, is_active, punch_card_enabled, created_at
  FROM public.car_clubs
 WHERE provider_id = '0bb98854-8aa8-41f7-816b-d06785167194'::uuid
 ORDER BY created_at DESC;

-- E.2 — Reward catalog row for the newest club (the DO block just created).
-- Expect exactly one row with kind='comp_service', point_cost=10, active=true.
SELECT r.id, r.club_id, r.title, r.kind, r.point_cost, r.inventory_qty, r.active
  FROM public.club_rewards r
  JOIN public.car_clubs   c ON c.id = r.club_id
 WHERE c.provider_id = '0bb98854-8aa8-41f7-816b-d06785167194'::uuid
 ORDER BY r.created_at DESC;

-- E.3 — Reward rule for the newest club. Expect one row, punches_required=10.
SELECT rr.id, rr.club_id, rr.reward_name, rr.punches_required, rr.reward_type, rr.is_active
  FROM public.club_reward_rules rr
  JOIN public.car_clubs         c ON c.id = rr.club_id
 WHERE c.provider_id = '0bb98854-8aa8-41f7-816b-d06785167194'::uuid
 ORDER BY rr.created_at DESC;

-- E.4 — Precondition 0/0/0 for the NEW club. Nobody has joined yet, so
-- expect COUNT=0 across all three activity tables — for any member. This
-- variant does NOT scope by member_id (unlike the reset harness), so it
-- surfaces if anything unexpected exists on the new club at provisioning time.
--
-- NOTE: this query aggregates across the dummy provider's clubs. If the
-- provider only owns the newly-created club, all three counts are 0. If
-- there's a leftover club from a prior run, its rows show up here too — a
-- useful signal.
SELECT 'club_memberships'         AS tbl,
       COUNT(*)                   AS row_count_for_new_provider
  FROM public.club_memberships m
  JOIN public.car_clubs        c ON c.id = m.club_id
 WHERE c.provider_id = '0bb98854-8aa8-41f7-816b-d06785167194'::uuid
UNION ALL
SELECT 'club_points_ledger'       AS tbl,
       COUNT(*)                   AS row_count_for_new_provider
  FROM public.club_points_ledger l
  JOIN public.car_clubs          c ON c.id = l.club_id
 WHERE c.provider_id = '0bb98854-8aa8-41f7-816b-d06785167194'::uuid
UNION ALL
SELECT 'club_points_redemptions'  AS tbl,
       COUNT(*)                   AS row_count_for_new_provider
  FROM public.club_points_redemptions rd
  JOIN public.car_clubs               c ON c.id = rd.club_id
 WHERE c.provider_id = '0bb98854-8aa8-41f7-816b-d06785167194'::uuid;

-- E.5 — Flag allowlist final check. Should show:
--   enabled       = false
--   test_users    = [Jordan uid, Chris uid, dummy uid] (order may vary)
SELECT setting_value->'enabled'    AS flag_enabled_final,
       setting_value->'test_users' AS test_users_final
  FROM public.platform_settings
 WHERE setting_key = 'car_club_programs_enabled';
