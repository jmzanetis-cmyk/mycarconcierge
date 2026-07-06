-- ============================================================================
-- Pilot club provisioning — atomic single-transaction script.
--
-- Provisions a Car Club for a pilot provider end-to-end:
--   1. Insert one car_clubs row (feature toggles matched to D5 pilot scope:
--      punch_card only; points/coupons/comp_services off).
--   2. Insert one club_reward_rules row (the punch-card reward rule).
--   3. Append the provider's uid to platform_settings.car_club_programs_enabled
--      test_users so this provider (and any members added the same way) sees
--      the feature while the global flag stays off.
--
-- Wrapped in one BEGIN/COMMIT so a failure at any step rolls everything back —
-- no half-provisioned clubs. Safe to abort mid-run.
--
-- Idempotency: this script does NOT check for an existing club owned by the
-- provider before inserting — it will happily create a second club. The DO
-- block emits a NOTICE if it detects a pre-existing club so you can spot the
-- accidental double-provision in Studio's Notices tab.
--
-- Column names verified against migrations:
--   car_clubs           — 20260703a:1-23
--   club_reward_rules   — 20260703d:1-12
--   platform_settings   — Replit-era (unmigrated; schema-drift entry in §9a)
--
-- Usage:
--   1. Replace every <REPLACE_*> placeholder below with the pilot provider's
--      actual values.
--   2. Paste the whole file into Supabase Studio → SQL Editor → Run.
--   3. Read the NOTICE output for the returned club_id and confirm the
--      verification queries at the bottom show what you expect.
--   4. Log the resulting club_id in the plan (or wherever we track pilot state).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  -- ↓↓↓ REPLACE THESE VALUES BEFORE RUNNING ↓↓↓
  v_provider_uid   uuid := '<REPLACE_PROVIDER_UID>';       -- Chris's Supabase auth.users.id
  v_club_name      text := '<REPLACE_CLUB_NAME>';           -- e.g. 'Alpha Auto Body Rewards'
  v_club_desc      text := '<REPLACE_CLUB_DESCRIPTION>';    -- e.g. 'Loyalty rewards for our regulars.' — or leave as literal NULL if none
  v_reward_name    text := '<REPLACE_REWARD_NAME>';         -- e.g. 'Free Oil Change'
  v_reward_desc    text := '<REPLACE_REWARD_DESCRIPTION>';  -- e.g. 'Full synthetic oil change (5W-30).' — or literal NULL
  v_punches        int  := 10;                              -- number of punches to unlock the reward (per D5 pilot: keep it round)
  v_theme_color    text := '#C9A84C';                       -- accent color (hex); match Chris's brand if known
  -- ↑↑↑ REPLACE THESE VALUES BEFORE RUNNING ↑↑↑

  v_club_id uuid;
BEGIN
  -- Non-blocking warning if this provider already owns ≥1 club.
  IF EXISTS (SELECT 1 FROM public.car_clubs WHERE provider_id = v_provider_uid) THEN
    RAISE NOTICE 'NOTE: provider % already owns >= 1 car_club. Proceeding to add another; abort if unintended.', v_provider_uid;
  END IF;

  -- Step 1: create the club. is_active=true, provider_suspended=false, and
  -- feature toggles matched to D5 pilot scope (punch_card only).
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
    NULLIF(v_club_desc, '<REPLACE_CLUB_DESCRIPTION>'),
    true,
    false,
    v_theme_color,
    true,
    false,
    false,
    false
  )
  RETURNING id INTO v_club_id;

  -- Step 2: the reward rule. reward_type='punch_card' per D2. is_active=true so
  -- the client's progress rendering picks it up.
  INSERT INTO public.club_reward_rules (
    club_id,
    reward_name,
    reward_description,
    punches_required,
    reward_type,
    is_active
  ) VALUES (
    v_club_id,
    v_reward_name,
    NULLIF(v_reward_desc, '<REPLACE_REWARD_DESCRIPTION>'),
    v_punches,
    'punch_card',
    true
  );

  -- Step 3: add provider to test_users on the Car Club feature flag. Matches
  -- the canonical append pattern documented in plan §9. COALESCE guards
  -- against a missing test_users key; to_jsonb(text) casts the uid string to
  -- a proper jsonb string element (not a raw uuid).
  UPDATE public.platform_settings
     SET setting_value = jsonb_set(
       setting_value,
       '{test_users}',
       COALESCE(setting_value->'test_users', '[]'::jsonb)
         || to_jsonb(v_provider_uid::text)
     )
   WHERE setting_key = 'car_club_programs_enabled';

  RAISE NOTICE 'Provisioned club "%" (id=%) for provider % — added to test_users.',
    v_club_name, v_club_id, v_provider_uid;
END $$;

COMMIT;

-- ============================================================================
-- Verification queries — run these AFTER the COMMIT above succeeds.
-- Substitute the same provider uid you used in the DO block.
-- ============================================================================

-- 1. Confirm the club + rule landed as expected.
SELECT c.id AS club_id, c.name AS club_name, c.provider_id,
       c.is_active, c.provider_suspended, c.punch_card_enabled, c.theme_color,
       r.id AS rule_id, r.reward_name, r.punches_required,
       r.reward_type, r.is_active AS rule_active
  FROM public.car_clubs c
  JOIN public.club_reward_rules r ON r.club_id = c.id
 WHERE c.provider_id = '<REPLACE_PROVIDER_UID>'::uuid
 ORDER BY c.created_at DESC;
-- Expected: one row per provisioned club with its rule attached.

-- 2. Confirm the provider is in test_users AND global flag is still off (Stage 0/1 posture).
SELECT setting_value->'enabled'    AS flag_enabled,
       setting_value->'test_users' AS test_users_list
  FROM public.platform_settings
 WHERE setting_key = 'car_club_programs_enabled';
-- Expected: enabled=false, test_users list contains the provider uid.
