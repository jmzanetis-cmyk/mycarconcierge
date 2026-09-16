-- ============================================================================
-- 20260921a_service_menu_items.sql
--
-- Phase 2 of the auto-bid redesign (rate card). MCC-maintained catalog of
-- concrete line items providers can price. Sits between service_categories
-- (broad taxonomy) and provider_rate_card_items (each provider's own prices).
--
-- WHY A CATALOG (not free-text on provider_rate_card_items):
--   The eventual notify engine (Phase 3+) matches a job to a small set of
--   item_keys — that only works if the item_key vocabulary is closed and
--   shared across providers. Free-text descriptions would fragment on spelling
--   ("Oil change" vs "oil-change" vs "Full-Synthetic Oil"). This table is
--   the single source of truth for the vocabulary.
--
-- WHY READ-EVERYWHERE RLS (mirrors service_categories):
--   Same read-mostly reference-table shape as public.service_categories
--   from 20260920a_taxonomy_unification.sql. Anon + authenticated get SELECT;
--   no INSERT/UPDATE/DELETE policies means only service_role (which bypasses
--   RLS) can mutate — mutations happen via ops SQL, not via app code.
--
-- SEED — 22 rows total, verified against the real 180-day care_plans corpus
-- during design. Production traffic today is almost entirely `maintenance`
-- so the seed is maintenance-heavy on purpose (15/22 = 68%), plus a small
-- footprint for detailing (5) and cosmetic (2) to bootstrap those trades
-- before the corpus shows demand for them. Other categories are deliberately
-- deferred — no rows until the notify engine has real signal that a category
-- is worth pricing.
--
-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS + INSERT ... ON CONFLICT DO UPDATE.
-- Re-runs are safe and will overwrite label/sort_order/category/active with
-- the current seed values (so a label typo fix here is a one-file change +
-- re-run, no separate patch migration needed).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_menu_items (
  item_key    text PRIMARY KEY,
  category    text NOT NULL REFERENCES public.service_categories(slug),
  label       text NOT NULL,
  sort_order  smallint NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Read-everywhere RLS — same shape as service_categories in 20260920a.
ALTER TABLE public.service_menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_menu_items_read ON public.service_menu_items;
CREATE POLICY service_menu_items_read ON public.service_menu_items
  FOR SELECT TO anon, authenticated USING (true);

-- Seed. sort_order is grouped by category, mechanical items first inside
-- each category — matches the way providers naturally scan a menu.
INSERT INTO public.service_menu_items (item_key, category, label, sort_order) VALUES
  -- maintenance (10-24) — 15 items, real order of frequency in the corpus
  ('oil_change_conventional',  'maintenance', 'Oil Change (Conventional)',      10),
  ('oil_change_synthetic',     'maintenance', 'Oil Change (Full Synthetic)',    11),
  ('brake_pads_front',         'maintenance', 'Brake Pads — Front',             12),
  ('brake_pads_rear',          'maintenance', 'Brake Pads — Rear',              13),
  ('brake_rotors',             'maintenance', 'Brake Rotors (per axle)',        14),
  ('tire_rotation',            'maintenance', 'Tire Rotation',                  15),
  ('tire_replacement',         'maintenance', 'Tire Replacement (per tire)',    16),
  ('alignment_4wheel',         'maintenance', '4-Wheel Alignment',              17),
  ('battery_replacement',      'maintenance', 'Battery Replacement',            18),
  ('ac_recharge',              'maintenance', 'A/C Recharge',                   19),
  ('coolant_flush',            'maintenance', 'Coolant Flush',                  20),
  ('transmission_service',     'maintenance', 'Transmission Service',           21),
  ('diagnostic_check_engine',  'maintenance', 'Check-Engine Diagnostic',        22),
  ('multi_point_inspection',   'maintenance', 'Multi-Point Inspection',         23),
  ('inspection_state',         'maintenance', 'State Inspection',               24),
  -- detailing (30-34) — 5 items
  ('full_detail',              'detailing',   'Full Detail (Interior + Exterior)', 30),
  ('interior_detail',          'detailing',   'Interior Detail',                31),
  ('exterior_detail',          'detailing',   'Exterior Detail',                32),
  ('ceramic_coating',          'detailing',   'Ceramic Coating',                33),
  ('headlight_restoration',    'detailing',   'Headlight Restoration',          34),
  -- cosmetic (40-41) — 2 items to bootstrap the category
  ('dent_removal_small',       'cosmetic',    'Small Dent Removal (PDR)',       40),
  ('paint_touch_up',           'cosmetic',    'Paint Touch-Up',                 41)
ON CONFLICT (item_key) DO UPDATE
  SET category   = EXCLUDED.category,
      label      = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      active     = EXCLUDED.active;
