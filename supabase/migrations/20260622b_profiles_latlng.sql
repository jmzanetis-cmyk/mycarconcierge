-- ============================================================================
-- 20260622b_profiles_latlng.sql
-- profiles.lat / profiles.lng — coordinates for distance gating
-- (Step 1d-1b-1).
--
-- PURPOSE:
--   Step 1d-1b adds a distance check to the bid gate
--   (plan-bids.js, Stage 1d-1b-5). The check reads the provider's
--   coordinates and compares against the job's care_plans.lat/lng using
--   the native pg point<@>point operator (statute miles). profiles
--   currently stores only city/state/zip_code — no lat/lng anywhere
--   (grep ALTER TABLE profiles ADD COLUMN | lat|lng returns nothing
--   across supabase/migrations as of 2026-06-22).
--
--   This migration adds ONLY the columns. Population happens in:
--     - Stage 1d-1b-2: provider address-collection UI calls the
--       server-side geocode service (Stage 1d-1b-1, geocode.js) on save
--       and writes lat/lng here.
--     - Stage 1d-1b-3: one-shot backfill script geocodes the existing
--       17 providers (street-precise if provider_applications.address_line1
--       is populated, zip-centroid fallback otherwise).
--
-- WHY ON profiles:
--   The distance gate already reads profiles in plan-bids.js
--   (checkBidGate at line 154 selects id/role/verification_status/
--   suspended_at). Adding lat/lng to the same row keeps the gate query
--   to one SELECT and one table. provider_match_preferences.profile_id
--   is the FK we'd join on otherwise; keeping the radius there
--   (match_radius_miles) and the coords on profiles is a deliberate
--   split — radius is a preference (provider edits), coords are a
--   derived fact (system computes via geocode on address save).
--
-- TYPE — numeric(10,7):
--   Matches care_plans.lat/lng (20260328_job_board.sql:29-30). 7 decimal
--   places ≈ 1.1 cm precision, well past what Nominatim returns.
--
-- NULLABILITY:
--   Nullable, no default. Existing 17 providers + all members get NULL
--   until Stage 1d-1b-3 backfills providers. The 1d-1b-5 distance gate
--   is null-safe: if either side has null lat/lng, the gate SKIPS the
--   distance check (never blocks the bid). This is the "never-block"
--   rule from the 1d-1b playbook — coords fill in over time without
--   ever ungating a provider.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lat numeric(10,7);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lng numeric(10,7);
