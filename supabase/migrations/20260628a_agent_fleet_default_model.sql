-- ============================================================================
-- 20260628a — Update agents.model default to claude-sonnet-4-6 and migrate
--             existing rows off retired Sonnet snapshots.
--
-- WHY
--   The historical migration 20260422_agent_fleet.sql created public.agents
--   with column default `model text NOT NULL DEFAULT 'claude-sonnet-4-5'`
--   and seeded 6 fleet agents (analyst, matchmaker, treasurer, gatekeeper,
--   concierge, advocate, hunter) with that explicit model. Anthropic has
--   retired the May 2025 Sonnet 4 snapshot (`claude-sonnet-4-20250514`) and
--   the `claude-sonnet-4-5` minor is also being retired — calls to either
--   now error with model_not_found / 404, which is what was silently breaking
--   the Car Expert chat and the AI dispute resolver.
--
--   The historical 20260422 file is intentionally NOT edited — its
--   CREATE TABLE IF NOT EXISTS is a no-op against an existing live DB, and
--   rewriting historical migrations to reflect later state makes the file
--   no longer describe what actually ran. This migration is the canonical
--   place to update live state.
--
-- WHAT THIS DOES
--   1. ALTER COLUMN DEFAULT — new agent rows inserted without an explicit
--      model now get `claude-sonnet-4-6` instead of the retired `4-5`.
--   2. UPDATE existing rows — surgical, only rows currently on a retired
--      string get moved to `claude-sonnet-4-6`. Agents intentionally set to
--      a different model (e.g. a Haiku agent) are left untouched.
--
-- POST-APPLY VERIFICATION (run in Studio)
--   SELECT column_name, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='agents' AND column_name='model';
--     → expect column_default = '''claude-sonnet-4-6''::text'
--
--   SELECT slug, model FROM public.agents ORDER BY slug;
--     → expect no rows on 'claude-sonnet-4-5' or 'claude-sonnet-4-20250514';
--       any Haiku/Opus rows preserved.
-- ============================================================================

ALTER TABLE public.agents
  ALTER COLUMN model SET DEFAULT 'claude-sonnet-4-6';

-- Surgical migration of existing rows: only stale strings get moved.
-- Touches the 6 seeded fleet agents (and any other rows that drifted onto a
-- retired model id), leaves intentionally-set non-Sonnet rows alone.
UPDATE public.agents
   SET model = 'claude-sonnet-4-6',
       updated_at = now()
 WHERE model IN ('claude-sonnet-4-5', 'claude-sonnet-4-20250514');

-- ============================================================================
-- End of 20260628a_agent_fleet_default_model.sql
-- ============================================================================
