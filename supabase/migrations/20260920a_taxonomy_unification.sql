-- ============================================================================
-- 20260920a_taxonomy_unification.sql — Phase 2.6.1
--
-- One service taxonomy end to end. Adds an explicit `categories` column to
-- care_plans (the 20 member-facing slugs), backfills it from the legacy
-- service_types array, and widens provider_match_preferences so providers can
-- declare non-mechanical trades (detailing, audio, lighting, interior, EV,
-- classic, motorcycle, RV, marine, ...) instead of everything collapsing into
-- 'cosmetic' / 'other'.
--
-- ADDITIVE ONLY. No columns dropped, no constraints tightened, no data
-- removed. service_types is left in place and still populated by the client
-- so any reader that hasn't been updated keeps working. Safe to re-run.
--
-- Mirrors netlify/functions/_taxonomy.js (serviceTypeToCategory and
-- LEGACY_BUCKET_TO_CATEGORIES). If you change the JS classifier, change
-- mcc_service_type_to_category() below to match.
-- ============================================================================

-- 1. care_plans: explicit categories + bundle linkage (bundle columns are
--    used by Phase 2.6.2; adding them now avoids a second migration).
ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS categories      text[]   NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS bundle_id       uuid,
  ADD COLUMN IF NOT EXISTS bundle_position smallint;

CREATE INDEX IF NOT EXISTS care_plans_categories_gin_idx
  ON public.care_plans USING gin (categories);
CREATE INDEX IF NOT EXISTS care_plans_bundle_id_idx
  ON public.care_plans (bundle_id) WHERE bundle_id IS NOT NULL;

-- 2. Canonical category list as a table so SQL can validate against it
--    (the JS keeps its own copy; the test suite asserts they match).
CREATE TABLE IF NOT EXISTS public.service_categories (
  slug        text PRIMARY KEY,
  label       text NOT NULL,
  grp         text NOT NULL,
  sort_order  smallint NOT NULL
);

INSERT INTO public.service_categories (slug, label, grp, sort_order) VALUES
  ('maintenance', 'Maintenance & Mechanical',          'mechanical',  1),
  ('manufacturer_service', 'Manufacturer Service Packages',     'mechanical',  2),
  ('detailing', 'Detailing & Cleaning',              'appearance',  3),
  ('cosmetic', 'Cosmetic & Body',           'appearance',  4),
  ('accident_repair', 'Accident / Insurance Repair',       'appearance',  5),
  ('performance', 'Performance & Modifications',              'mechanical',  6),
  ('audio_electronics', 'Audio & Electronics',               'specialty',   7),
  ('lighting', 'Lighting & Accessories',                          'specialty',   8),
  ('interior', 'Interior & Upholstery',             'specialty',   9),
  ('offroad', 'Off-Road & Specialty',                   'mechanical', 10),
  ('ev_hybrid', 'EV & Hybrid Services',                       'mechanical', 11),
  ('classic_vintage', 'Classic & Vintage Cars',                 'mechanical', 12),
  ('fleet_graphics', 'Fleet & Commercial Graphics',            'appearance', 13),
  ('premium_protection', 'Premium Protection (PPF/Coating)',       'appearance', 14),
  ('convertible_specialty', 'Convertible & Specialty',           'specialty',  15),
  ('motorcycle', 'Motorcycle Services',                        'specialty',  16),
  ('rv_camper', 'RV & Camper Services',                       'specialty',  17),
  ('boat_marine', 'Boat & Marine Services',                     'specialty',  18),
  ('snow_removal', 'Snow Removal Services',                      'specialty',  19),
  ('other', 'Other',                             'specialty',  20)
ON CONFLICT (slug) DO UPDATE
  SET label = EXCLUDED.label, grp = EXCLUDED.grp, sort_order = EXCLUDED.sort_order;

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_categories_read ON public.service_categories;
CREATE POLICY service_categories_read ON public.service_categories
  FOR SELECT TO anon, authenticated USING (true);

-- 3. Keyword classifier — SQL twin of _taxonomy.serviceTypeToCategory().
--    Priority order is deliberate and identical to the JS: exact slug →
--    specialty vehicles → appearance/protection → electronics/interior →
--    mechanical → 'other'.
CREATE OR REPLACE FUNCTION public.mcc_service_type_to_category(raw text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  s text := lower(trim(coalesce(raw, '')));
BEGIN
  IF s = '' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.service_categories WHERE slug = s) THEN RETURN s; END IF;

  -- specialty vehicles
  IF s LIKE '%motorcycle%' OR s LIKE '%scooter%' OR s ~ '(^|[^a-z0-9])moto([^a-z0-9]|$)' THEN RETURN 'motorcycle'; END IF;
  IF s LIKE '%camper%' OR s LIKE '%motorhome%' OR s ~ '(^|[^a-z0-9])rv([^a-z0-9]|$)' THEN RETURN 'rv_camper'; END IF;
  IF s LIKE '%boat%' OR s LIKE '%marine%' OR s LIKE '%outboard%' OR s LIKE '%jet ski%' OR s LIKE '%jetski%' THEN RETURN 'boat_marine'; END IF;
  IF s LIKE '%classic%' OR s LIKE '%vintage%' THEN RETURN 'classic_vintage'; END IF;
  IF s LIKE '%convertible%' OR s LIKE '%soft top%' OR s LIKE '%softtop%' THEN RETURN 'convertible_specialty'; END IF;
  IF s LIKE '%snow%' OR s LIKE '%plow%' THEN RETURN 'snow_removal'; END IF;

  -- appearance & protection
  IF s LIKE '%paint protection%' OR s LIKE '%ceramic%' OR s LIKE '%coating%' OR s LIKE '%tint%' OR s ~ '(^|[^a-z0-9])ppf([^a-z0-9]|$)' THEN RETURN 'premium_protection'; END IF;
  IF s LIKE '%fleet%' OR s LIKE '%decal%' OR s LIKE '%graphic%' OR s LIKE '%livery%' OR s LIKE '%wrap%' THEN RETURN 'fleet_graphics'; END IF;
  IF s LIKE '%detail%' OR s LIKE '%wax%' OR s LIKE '%polish%' OR s LIKE '%paint correction%' OR s LIKE '%odor%'
     OR s ~ '(^|[^a-z0-9])(wash|washing)([^a-z0-9]|$)' THEN RETURN 'detailing'; END IF;
  IF s LIKE '%collision%' OR s LIKE '%accident%' OR s LIKE '%insurance%' OR s LIKE '%structural%' OR s LIKE '%glass%' OR s LIKE '%windshield%'
     OR s LIKE '%paint%' OR s ~ '(^|[^a-z0-9])(body|dent|dents|dented)([^a-z0-9]|$)' THEN RETURN 'accident_repair'; END IF;
  IF s LIKE '%scratch%' OR s LIKE '%chip%' OR s LIKE '%touch up%' OR s LIKE '%touch-up%' OR s LIKE '%bumper%' OR s LIKE '%cosmetic%'
     OR s ~ '(^|[^a-z0-9])(ding|dings)([^a-z0-9]|$)' THEN RETURN 'cosmetic'; END IF;

  -- electronics, lighting, interior
  IF s LIKE '%audio%' OR s LIKE '%stereo%' OR s LIKE '%speaker%' OR s LIKE '%subwoofer%' OR s LIKE '%amplifier%' OR s LIKE '%infotainment%'
     OR s LIKE '%carplay%' OR s LIKE '%android auto%' OR s LIKE '%dash cam%' OR s LIKE '%dashcam%' OR s LIKE '%remote start%'
     OR s LIKE '%alarm%' OR s LIKE '%backup camera%' OR s LIKE '%electronics%' THEN RETURN 'audio_electronics'; END IF;
  IF s LIKE '%headlight%' OR s LIKE '%taillight%' OR s LIKE '%tail light%' OR s LIKE '%underglow%' OR s LIKE '%bulb%'
     OR s ~ '(^|[^a-z0-9])(light|lights|lighting|led|leds|hid)([^a-z0-9]|$)' THEN RETURN 'lighting'; END IF;
  IF s LIKE '%upholster%' OR s LIKE '%carpet%' OR s LIKE '%headliner%' OR s LIKE '%interior%'
     OR s ~ '(^|[^a-z0-9])(seat|seats)([^a-z0-9]|$)' THEN RETURN 'interior'; END IF;

  -- mechanical & service
  IF s LIKE '%electric vehicle%' OR s LIKE '%hybrid%' OR s LIKE '%charging%' OR s LIKE '%battery pack%' OR s LIKE '%high voltage%'
     OR s ~ '(^|[^a-z0-9])(ev|evs)([^a-z0-9]|$)' THEN RETURN 'ev_hybrid'; END IF;
  IF s LIKE '%off-road%' OR s LIKE '%offroad%' OR s ~ '(^|[^a-z0-9])(lift|lifted|trail|trails)([^a-z0-9]|$)' THEN RETURN 'offroad'; END IF;
  IF s LIKE '%exhaust%' OR s LIKE '%suspension%' OR s LIKE '%performance%' OR s LIKE '%tuning%' OR s LIKE '%turbo%' OR s LIKE '%supercharger%' OR s LIKE '%intake%' THEN RETURN 'performance'; END IF;
  IF s LIKE '%warranty%' OR s LIKE '%manufacturer%' OR s LIKE '%scheduled%' OR s LIKE '%recall%' OR s LIKE '%dealership%' THEN RETURN 'manufacturer_service'; END IF;
  IF s LIKE '%brake%' OR s LIKE '%fluid%' OR s LIKE '%battery%' OR s LIKE '%transmission%'
     OR s LIKE '%engine%' OR s LIKE '%diagnos%' OR s LIKE '%alignment%' OR s LIKE '%coolant%' OR s LIKE '%spark%' OR s LIKE '%filter%'
     OR s LIKE '%inspection%' OR s LIKE '%multi-point%' OR s LIKE '%electrical%' OR s LIKE '%alternator%' OR s LIKE '%starter%'
     OR s LIKE '%radiator%' OR s LIKE '%belt%' OR s LIKE '%wiper%' OR s LIKE '%repair%' OR s LIKE '%service%'
     OR s LIKE '%maintenance%' OR s ~ '(^|[^a-z0-9])(oil|tire|tires|tyre|tyres|hose|hoses|tune|ac)([^a-z0-9]|$)' OR s LIKE '%a/c%' THEN RETURN 'maintenance'; END IF;

  RETURN 'other';
END $$;

-- 4. Backfill care_plans.categories for rows that don't have one yet.
--    Idempotent: only touches rows whose categories are still empty.
UPDATE public.care_plans cp
   SET categories = sub.cats
  FROM (
    SELECT id,
           ARRAY(SELECT DISTINCT c FROM (
                   SELECT public.mcc_service_type_to_category(t) AS c
                     FROM unnest(service_types) AS t
                 ) x WHERE c IS NOT NULL) AS cats
      FROM public.care_plans
     WHERE (categories IS NULL OR cardinality(categories) = 0)
       AND service_types IS NOT NULL AND cardinality(service_types) > 0
  ) sub
 WHERE cp.id = sub.id
   AND cardinality(sub.cats) > 0;

-- 5. Widen provider preferences. The old 8 buckets had broader meanings than
--    the same-named categories: 'cosmetic' covered detail/wrap/tint and
--    'other' covered every unlisted trade. Expand those explicitly so no
--    provider loses matches on day one; they prune in the new settings UI.
--    Idempotent: array_cat + de-dup, and only for rows still carrying the
--    ambiguous buckets without their expanded members.
UPDATE public.provider_match_preferences
   SET match_categories = ARRAY(SELECT DISTINCT c FROM unnest(
         match_categories || ARRAY['detailing','premium_protection','fleet_graphics']) AS c),
       updated_at = now()
 WHERE 'cosmetic' = ANY(match_categories)
   AND NOT (match_categories && ARRAY['detailing','premium_protection','fleet_graphics']);

UPDATE public.provider_match_preferences
   SET match_categories = ARRAY(SELECT DISTINCT c FROM unnest(
         match_categories || ARRAY['audio_electronics','lighting','interior','ev_hybrid',
                                   'classic_vintage','convertible_specialty','motorcycle',
                                   'rv_camper','boat_marine']) AS c),
       updated_at = now()
 WHERE 'other' = ANY(match_categories)
   AND NOT (match_categories && ARRAY['audio_electronics','lighting','interior','ev_hybrid',
                                      'classic_vintage','convertible_specialty','motorcycle',
                                      'rv_camper','boat_marine']);

-- 6. Report (visible in the SQL editor output).
DO $$
DECLARE n_plans int; n_uncat int; n_prov int;
BEGIN
  SELECT count(*) INTO n_plans FROM public.care_plans WHERE cardinality(categories) > 0;
  SELECT count(*) INTO n_uncat FROM public.care_plans WHERE cardinality(categories) = 0;
  SELECT count(*) INTO n_prov  FROM public.provider_match_preferences;
  RAISE NOTICE 'taxonomy_unification: care_plans categorised=% uncategorised=% provider_prefs=%', n_plans, n_uncat, n_prov;
END $$;
