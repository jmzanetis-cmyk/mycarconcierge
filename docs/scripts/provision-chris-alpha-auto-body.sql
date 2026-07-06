-- ============================================================================
-- PERMANENT RECORD — Chris Agrapidis / Alpha Auto Body Rewards provisioning.
-- Applied to prod 2026-07-06 20:03:18 UTC via Supabase Studio SQL Editor.
--
-- DO NOT RE-RUN. This file is a memorial of what actually landed in prod
-- for auditability. If a future pilot provider needs their club provisioned,
-- copy from provision-pilot-club.sql (the template) and record their own
-- provisioning as a new companion file, don't re-run this one.
--
-- Result (from verification query — see bottom of this file):
--   club_id            = fee6de4f-de82-4c73-8097-5392007302d1
--   provider_id (Chris)= dbb15523-2441-4ad9-8d2d-c6d8812c7ca2
--   created_at         = 2026-07-06 20:03:18.137604+00
--
-- Followed immediately by seed cleanup (deactivate-seed-clubs.sql) — Jordan's
-- 3 dev seed clubs deactivated at 2026-07-06 20:10:56 UTC:
--   Honda & Acura Club       (4b0ceb82-228e-492c-abb7-8a17bf544d4a)
--   Truck & SUV Owners       (688ee2a5-f75e-42a7-ada6-1bb7b7aa3b73)
--   BMW Enthusiasts NJ       (31e07510-639e-4bfc-a5d3-96be62290892)
--
-- Post-cleanup state (verified via SELECT ... WHERE is_active = true):
--   exactly one active row: Alpha Auto Body Rewards (Chris's club).
--
-- Global flag posture after this session:
--   platform_settings.car_club_programs_enabled.enabled = false
--   platform_settings.car_club_programs_enabled.test_users =
--     [ "8ea2bc19-16c7-4af2-8d4d-551434a53ec7"   (Jordan)
--     , "dbb15523-2441-4ad9-8d2d-c6d8812c7ca2"   (Chris)
--     ]
-- ============================================================================

BEGIN;

DO $$
DECLARE
  -- Values that went into prod for Chris.
  v_provider_uid   uuid := 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2';   -- Chris
  v_club_name      text := 'Alpha Auto Body Rewards';
  v_club_desc      text := 'Loyalty program for Alpha Auto Body customers — earn punches on each visit and unlock rewards.';
  v_reward_name    text := 'Free Oil Change';
  v_reward_desc    text := 'Full synthetic oil change with any qualifying service visit.';
  v_punches        int  := 10;
  v_theme_color    text := '#C9A84C';

  v_club_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.car_clubs WHERE provider_id = v_provider_uid) THEN
    RAISE NOTICE 'NOTE: provider % already owns >= 1 car_club. Proceeding to add another; abort if unintended.', v_provider_uid;
  END IF;

  INSERT INTO public.car_clubs (
    provider_id, name, description,
    is_active, provider_suspended,
    theme_color, punch_card_enabled,
    points_enabled, coupons_enabled, comp_services_enabled
  ) VALUES (
    v_provider_uid, v_club_name, v_club_desc,
    true, false,
    v_theme_color, true,
    false, false, false
  )
  RETURNING id INTO v_club_id;

  INSERT INTO public.club_reward_rules (
    club_id, reward_name, reward_description,
    punches_required, reward_type, is_active
  ) VALUES (
    v_club_id, v_reward_name, v_reward_desc,
    v_punches, 'punch_card', true
  );

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
-- Verification queries (results from prod at 2026-07-06 20:04):
--
-- SELECT c.id AS club_id, c.name, c.provider_id,
--        c.is_active, c.provider_suspended, c.punch_card_enabled, c.theme_color,
--        r.reward_name, r.punches_required, r.reward_type, r.is_active AS rule_active
--   FROM public.car_clubs c
--   JOIN public.club_reward_rules r ON r.club_id = c.id
--  WHERE c.provider_id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2'::uuid;
--
--  → fee6de4f-de82-4c73-8097-5392007302d1 | Alpha Auto Body Rewards | dbb15523-...
--    | true | false | true | #C9A84C | Free Oil Change | 10 | punch_card | true
--
--
-- SELECT setting_value->'enabled' AS flag_enabled,
--        setting_value->'test_users' AS test_users_list
--   FROM public.platform_settings
--  WHERE setting_key = 'car_club_programs_enabled';
--
--  → false | ["8ea2bc19-16c7-4af2-8d4d-551434a53ec7","dbb15523-2441-4ad9-8d2d-c6d8812c7ca2"]
-- ============================================================================
