-- ============================================================================
-- Task #161 — Gatekeeper smoke run log
--
-- Records every scheduled (or manual) execution of the Gatekeeper smoke test
-- so the admin UI can show "smoke last passed N hours ago" without having to
-- correlate against agent_actions or scheduled-function logs.
--
-- One row per run. Status is 'passed' if every leg succeeded, 'failed' if
-- any leg failed, 'error' for an uncaught exception in the runner itself.
-- The summary jsonb stores the per-event breakdown (event_type → action_id,
-- status, recommendation, cost) so the UI can show a quick pass/fail table
-- without re-querying agent_actions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_smoke_runs (
  id              bigserial PRIMARY KEY,
  agent_slug      text NOT NULL,                            -- 'gatekeeper' today; future-proof for other agents
  status          text NOT NULL CHECK (status IN ('passed','failed','error')),
  triggered_by    text NOT NULL DEFAULT 'scheduled',         -- 'scheduled' | 'admin'
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  duration_ms     integer,
  failure_count   integer NOT NULL DEFAULT 0,
  failed_checks   text[] NOT NULL DEFAULT '{}'::text[],
  summary         jsonb NOT NULL DEFAULT '{}'::jsonb,
  alert_email_sent boolean NOT NULL DEFAULT false,
  alert_email_error text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_smoke_runs_agent_idx
  ON public.agent_smoke_runs (agent_slug, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_smoke_runs_status_idx
  ON public.agent_smoke_runs (agent_slug, status, started_at DESC);
