-- Adds the market_intel jsonb column to dream_car_searches.
--
-- Why: server.js (Dream Car search endpoint at line ~12307 and the hourly
-- DreamCarDigest scheduler at line ~28252) both read/write search.market_intel
-- but the column was never added to the table, so the scheduler errors every
-- hour with PostgREST code 42703 ("column dream_car_searches.market_intel does
-- not exist") and the search endpoint silently skips persisting the intel.
--
-- Apply via Supabase SQL Editor. Idempotent — safe to re-run.

ALTER TABLE public.dream_car_searches
  ADD COLUMN IF NOT EXISTS market_intel jsonb;

COMMENT ON COLUMN public.dream_car_searches.market_intel IS
  'Cached market intelligence summary (price range, trend, search URLs, buying checklist) from buildMarketIntelligence(). Refreshed on each manual or scheduled search run; consumed by the hourly digest emailer.';
