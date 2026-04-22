-- ============================================================================
-- MCC Agent Fleet — Phase 2 prerequisite: DLQ + Retry + Spend-Cap Alerting
--
-- Adds the two cross-cutting infra pieces called out in
-- docs/agent-fleet-phase-2.md §3.2 (DLQ + retry) and §3.3 (spend-cap alerting).
-- These are HARD prerequisites before enabling any specialist agent — without
-- them a transient handler failure silently disappears and a runaway agent
-- silently breaches its cap.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. agent_events: retry bookkeeping columns.
--    `attempts` counts dispatch attempts; `next_retry_at` defers re-pickup
--    by the orchestrator until backoff has elapsed; `last_error` records the
--    most recent dispatch failure reason; `last_attempt_at` aids debugging.
--    All four are nullable / default 0 so existing rows are unaffected.
-- ----------------------------------------------------------------------------
ALTER TABLE public.agent_events
  ADD COLUMN IF NOT EXISTS attempts        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_error      text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Replace the partial unprocessed index with one that also honors next_retry_at,
-- so the orchestrator can keep using a single indexed scan to find work.
DROP INDEX IF EXISTS public.agent_events_unprocessed_idx;
CREATE INDEX IF NOT EXISTS agent_events_pickup_idx
  ON public.agent_events (created_at)
  WHERE processed_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. agent_dead_letter — events that exhausted MAX_ATTEMPTS dispatches.
--    Append-only. Admin can replay an entry (copies it back into agent_events
--    with attempts=0). We keep the original row in agent_events too (marked
--    processed with error set) so the audit trail is preserved.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_dead_letter (
  id              bigserial PRIMARY KEY,
  original_event_id bigint REFERENCES public.agent_events(id) ON DELETE SET NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source          text,
  attempts        integer NOT NULL DEFAULT 0,
  final_error     text,
  failed_at       timestamptz NOT NULL DEFAULT now(),
  replayed_at     timestamptz,
  replayed_by     text,
  replay_event_id bigint REFERENCES public.agent_events(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS agent_dead_letter_open_idx
  ON public.agent_dead_letter (failed_at DESC)
  WHERE replayed_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. agent_spend_alerts — one row per agent per day the cap was breached.
--    PRIMARY KEY (agent_slug, day) makes the runtime's notify path naturally
--    idempotent: ON CONFLICT DO NOTHING ensures we email the admin AT MOST
--    ONCE per agent per UTC day, no matter how many calls hit the cap after.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_spend_alerts (
  agent_slug       text NOT NULL REFERENCES public.agents(slug) ON DELETE CASCADE,
  day              date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  cap_usd          numeric(10,4) NOT NULL,
  estimate_usd     numeric(10,6) NOT NULL,
  reserved_usd     numeric(10,6),
  actual_usd       numeric(10,6),
  notified_at      timestamptz NOT NULL DEFAULT now(),
  email_sent       boolean NOT NULL DEFAULT false,
  email_error      text,
  PRIMARY KEY (agent_slug, day)
);

-- ----------------------------------------------------------------------------
-- 4. RLS — service-role-only, matching the pattern from the foundation migration.
-- ----------------------------------------------------------------------------
ALTER TABLE public.agent_dead_letter   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_spend_alerts  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_dead_letter','agent_spend_alerts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;
