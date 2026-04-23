-- ============================================================================
-- Task #128 — Agent prompt versioning
-- Per-agent system prompt overrides with full version history and rollback.
-- The runtime falls back to the file-based default constant when no version
-- is marked active for an agent. Apply via Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_prompt_versions (
  id          bigserial PRIMARY KEY,
  agent_slug  text NOT NULL REFERENCES public.agents(slug) ON DELETE CASCADE,
  version     int  NOT NULL,
  body        text NOT NULL,
  notes       text,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  UNIQUE (agent_slug, version)
);

CREATE INDEX IF NOT EXISTS agent_prompt_versions_agent_idx
  ON public.agent_prompt_versions (agent_slug, created_at DESC);

-- Enforce at most one active row per agent (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS agent_prompt_versions_one_active_per_agent
  ON public.agent_prompt_versions (agent_slug)
  WHERE is_active = true;

ALTER TABLE public.agent_prompt_versions ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS; admin endpoints use the service-role client.
-- No policies for anon — keep it locked down.
