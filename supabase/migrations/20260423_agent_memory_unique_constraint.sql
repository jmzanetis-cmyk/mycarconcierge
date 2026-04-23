-- ============================================================================
-- Agent Fleet — fix agent_memory ON CONFLICT inference
--
-- The original 20260422_agent_fleet.sql created a PARTIAL unique index on
-- agent_memory(agent_slug, kind, key) WHERE key IS NOT NULL. The Supabase JS
-- client's .upsert({ onConflict: 'agent_slug,kind,key' }) issues a plain
-- ON CONFLICT (cols) statement with no WHERE predicate, which Postgres cannot
-- match against a partial index — every saveMemory upsert errors with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Replace the partial index with a non-partial UNIQUE constraint over the
-- same three columns. Postgres treats NULLs as distinct in unique constraints
-- by default, so rows where key IS NULL remain insert-only (which is exactly
-- what saveMemory's else-branch already does).
-- ============================================================================

DROP INDEX IF EXISTS public.agent_memory_unique_key_idx;

ALTER TABLE public.agent_memory
  DROP CONSTRAINT IF EXISTS agent_memory_unique_key;

ALTER TABLE public.agent_memory
  ADD CONSTRAINT agent_memory_unique_key UNIQUE (agent_slug, kind, key);
