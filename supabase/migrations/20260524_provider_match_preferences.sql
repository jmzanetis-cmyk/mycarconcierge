-- ============================================================================
-- Task #389 — Provider Match Preferences
--
-- Lets providers tune which categories they want to be matched on, how far
-- they're willing to travel for matches, and pause matching entirely (with an
-- optional auto-resume date).
--
-- Adds a dedicated `provider_match_preferences` table keyed by profile_id.
-- Defaults are populated from the existing provider_applications row so that
-- providers who never visit the new settings panel keep getting matched
-- exactly as they do today.
--
-- The Task #33 matcher (`handleMatchProvidersForPackage` in www/server.js)
-- looks up this table and:
--   * skips providers with matches_paused=true and matches_paused_until
--     either NULL or in the future,
--   * filters candidates by match_categories overlapping the package category,
--   * filters by match_radius_miles against the member ZIP.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_match_preferences (
  profile_id            uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_categories      text[] NOT NULL DEFAULT ARRAY[]::text[],
  match_radius_miles    integer NOT NULL DEFAULT 25 CHECK (match_radius_miles > 0 AND match_radius_miles <= 500),
  matches_paused        boolean NOT NULL DEFAULT false,
  matches_paused_until  timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_match_preferences_paused_idx
  ON public.provider_match_preferences (matches_paused, matches_paused_until)
  WHERE matches_paused = true;

-- Backfill from provider_applications so existing providers behave the same
-- on day one. The category mapping mirrors `categoryToServiceMap` in
-- www/server.js (handleMatchProvidersForPackage). Anything we can't map gets
-- the full set of categories so the provider is never accidentally excluded.
DO $$
DECLARE r record;
  v_cats text[];
  v_radius integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='provider_applications') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT p.id AS profile_id, a.services_offered, a.service_radius_miles
      FROM public.profiles p
      LEFT JOIN public.provider_applications a ON a.user_id = p.id
     WHERE p.role IN ('provider','pending_provider') OR p.is_also_provider = true
  LOOP
    v_cats := ARRAY['maintenance','manufacturer_service','accident_repair',
                    'performance','cosmetic','offroad','snow_removal','other'];
    IF r.services_offered IS NOT NULL AND array_length(r.services_offered, 1) > 0 THEN
      v_cats := ARRAY(SELECT DISTINCT cat FROM (
        SELECT CASE
          WHEN s ILIKE '%oil%' OR s ILIKE '%brake%' OR s ILIKE '%tire%' OR s ILIKE '%tune%' OR s ILIKE '%fluid%' OR s = 'maintenance' THEN 'maintenance'
          WHEN s ILIKE '%body%' OR s ILIKE '%collision%' OR s ILIKE '%paint%' OR s ILIKE '%dent%' OR s = 'glass' THEN 'accident_repair'
          WHEN s ILIKE '%detail%' OR s ILIKE '%wrap%' OR s ILIKE '%tint%' THEN 'cosmetic'
          WHEN s ILIKE '%exhaust%' OR s ILIKE '%suspension%' OR s ILIKE '%performance%' OR s ILIKE '%tuning%' THEN 'performance'
          WHEN s ILIKE '%snow%' OR s ILIKE '%plow%' THEN 'snow_removal'
          WHEN s ILIKE '%lift%' OR s ILIKE '%off-road%' OR s ILIKE '%offroad%' THEN 'offroad'
          WHEN s ILIKE '%warranty%' OR s ILIKE '%manufacturer%' OR s ILIKE '%scheduled%' THEN 'manufacturer_service'
          ELSE 'other'
        END AS cat
        FROM unnest(r.services_offered) AS s
      ) sub);
      IF v_cats IS NULL OR array_length(v_cats, 1) IS NULL THEN
        v_cats := ARRAY['maintenance','manufacturer_service','accident_repair',
                        'performance','cosmetic','offroad','snow_removal','other'];
      END IF;
    END IF;

    v_radius := COALESCE(r.service_radius_miles, 25);
    IF v_radius <= 0 OR v_radius > 500 THEN v_radius := 25; END IF;

    INSERT INTO public.provider_match_preferences
      (profile_id, match_categories, match_radius_miles)
    VALUES (r.profile_id, v_cats, v_radius)
    ON CONFLICT (profile_id) DO NOTHING;
  END LOOP;
END $$;

-- Auto-resume helper: matchers call this before filtering so providers whose
-- paused_until has expired are unpaused in one shot. Defined SECURITY DEFINER
-- so service_role doesn't need to chase per-row writes from the client.
CREATE OR REPLACE FUNCTION public.provider_match_auto_resume()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.provider_match_preferences
     SET matches_paused = false,
         matches_paused_until = NULL,
         updated_at = now()
   WHERE matches_paused = true
     AND matches_paused_until IS NOT NULL
     AND matches_paused_until <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.provider_match_auto_resume() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_match_auto_resume() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_match_auto_resume() TO service_role;

-- RLS: providers can read/write their own row; service_role reads all.
ALTER TABLE public.provider_match_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pmp_self_read   ON public.provider_match_preferences;
DROP POLICY IF EXISTS pmp_self_upsert ON public.provider_match_preferences;
DROP POLICY IF EXISTS pmp_self_update ON public.provider_match_preferences;
DROP POLICY IF EXISTS pmp_service_all ON public.provider_match_preferences;

CREATE POLICY pmp_self_read ON public.provider_match_preferences
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY pmp_self_upsert ON public.provider_match_preferences
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY pmp_self_update ON public.provider_match_preferences
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY pmp_service_all ON public.provider_match_preferences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.provider_match_preferences_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS provider_match_preferences_touch_trg ON public.provider_match_preferences;
CREATE TRIGGER provider_match_preferences_touch_trg
  BEFORE UPDATE ON public.provider_match_preferences
  FOR EACH ROW EXECUTE FUNCTION public.provider_match_preferences_touch();
