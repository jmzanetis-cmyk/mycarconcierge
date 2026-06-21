-- ============================================================================
-- 20260622c_zip_centroids.sql
-- zip_centroids — US zip → (lat, lng) reference table for geocode fallback
-- (Step 1d-1b-1).
--
-- PURPOSE:
--   The 1d-1b distance gate needs SOME coordinate for every provider and
--   every job, even when no street address is available. Today:
--     - 0/10 provider_applications rows have address_line1 populated
--       (city only).
--     - Members typically don't have street address either (the create
--       modal collects only city/state/zip via profile, see Stage 1b-4
--       for the new address field).
--   Without a fallback, the gate would skip the distance check for
--   nearly every job (per the null-safe rule) and the gate would do
--   nothing. With this table, geocode.js (Stage 1b-1 Step C) returns
--   precision='zip' coords from here when street geocoding fails or
--   isn't possible, and the gate runs at zip-precision until real
--   street addresses arrive (then it sharpens per-record).
--
-- SCHEMA:
--   zip   PRIMARY KEY (text) — US zip codes are 5-digit strings;
--           leading zeros matter (e.g. '07601' NJ). NEVER cast to integer.
--   lat   numeric(10,7) NOT NULL — matches care_plans + profiles.
--   lng   numeric(10,7) NOT NULL — matches care_plans + profiles.
--   city  text — denormalized for human inspection + audit; not used by
--           the gate.
--   state text — same.
--
-- DATA LOAD:
--   The ~42k US zip rows are loaded SEPARATELY via Supabase Studio's
--   CSV import UI after this migration is applied. The chosen source is
--   the simplemaps US Zips free tier (CC BY 4.0 — attribution required,
--   commercial use OK; alternative: geonames postal-code dump, also
--   CC BY 4.0). The simplemaps CSV columns map cleanly to this schema:
--
--     simplemaps CSV header → zip_centroids column
--     ───────────────────────────────────────────
--     zip                  → zip      (string with leading zeros preserved)
--     lat                  → lat
--     lng                  → lng
--     city                 → city
--     state_id             → state    (2-letter — Studio import should
--                                       map state_id→state; rename in
--                                       the CSV header pre-upload if
--                                       needed)
--
--   The CSV has more columns (state_name, population, etc.) — Studio's
--   import UI lets you SKIP unmapped columns. Only zip/lat/lng/city/state
--   are imported here. Confirm the import preserves leading zeros on
--   zip (set the column type to text in the import UI, NOT integer).
--
--   Attribution (per CC BY 4.0): a credit line will land somewhere
--   visible to users — exact placement is a 1d-1b-5 UI decision.
--
-- RLS:
--   Reference data is public — every authenticated user (member,
--   provider, admin) needs to look up zip → coords for geocode fallback,
--   and the data itself is not sensitive (it's public reference data
--   from a CC BY 4.0 source). A single SELECT-true policy keeps the
--   query path simple. No write policy is created — writes go through
--   service_role only (one-shot CSV import + future refreshes via
--   maintenance scripts; both use service_role, which bypasses RLS).
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS +
-- CREATE POLICY. Safe to re-run; the CSV import is idempotent on
-- PRIMARY KEY conflict (Studio import offers an "Upsert / Ignore on
-- conflict" option — pick that).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.zip_centroids (
  zip   text PRIMARY KEY,
  lat   numeric(10,7) NOT NULL,
  lng   numeric(10,7) NOT NULL,
  city  text,
  state text
);

ALTER TABLE public.zip_centroids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read zip centroids" ON public.zip_centroids;
CREATE POLICY "Anyone can read zip centroids" ON public.zip_centroids
  FOR SELECT
  USING (true);

-- Service-role full access is implicit (service_role bypasses RLS).
-- No INSERT/UPDATE/DELETE policies — direct table writes from a client
-- JWT are denied. Writes flow through one-shot scripts using
-- SUPABASE_SERVICE_ROLE_KEY.
