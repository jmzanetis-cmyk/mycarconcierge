-- ============================================================================
-- MCC Agent Fleet — Foundation Migration
-- Phase 1: Orchestrator + Analyst (rest of the fleet seeded but disabled)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. agents (registry of all fleet members)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agents (
  slug              text PRIMARY KEY,
  display_name      text NOT NULL,
  description       text,
  enabled           boolean NOT NULL DEFAULT false,
  autonomy          text NOT NULL DEFAULT 'propose'
                    CHECK (autonomy IN ('propose','assist','autonomous')),
  model             text NOT NULL DEFAULT 'claude-sonnet-4-5',
  daily_spend_cap_usd numeric(10,4) NOT NULL DEFAULT 5.00,
  handles_events    text[] NOT NULL DEFAULT ARRAY[]::text[],
  endpoint          text,            -- relative path of background fn (e.g. /.netlify/functions/agent-matchmaker-bg)
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. agent_events (event bus — append-only, orchestrator drains)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_events (
  id           bigserial PRIMARY KEY,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  source       text,
  processed_at timestamptz,
  routed_to    text[],
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_events_unprocessed_idx
  ON public.agent_events (created_at)
  WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS agent_events_type_idx
  ON public.agent_events (event_type, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. agent_actions (audit log — every invocation, including skips)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id              bigserial PRIMARY KEY,
  agent_slug      text NOT NULL REFERENCES public.agents(slug) ON DELETE CASCADE,
  event_id        bigint REFERENCES public.agent_events(id) ON DELETE SET NULL,
  action_type     text NOT NULL,                          -- e.g. 'propose_refund', 'route_event', 'briefing'
  status          text NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('completed','proposed','executed','escalated','skipped','error')),
  autonomy_used   text,
  decision        jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning       text,
  confidence      numeric(4,3),
  tokens_in       integer NOT NULL DEFAULT 0,
  tokens_out      integer NOT NULL DEFAULT 0,
  cost_usd        numeric(10,6) NOT NULL DEFAULT 0,
  duration_ms     integer NOT NULL DEFAULT 0,
  needs_review    boolean NOT NULL DEFAULT false,
  reviewed_at     timestamptz,
  reviewed_by     text,
  review_status   text CHECK (review_status IN ('approved','rejected','executed','dismissed')),
  review_notes    text,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_actions_agent_idx       ON public.agent_actions (agent_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_actions_review_idx      ON public.agent_actions (needs_review, created_at DESC) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS agent_actions_event_idx       ON public.agent_actions (event_id);

-- ----------------------------------------------------------------------------
-- 4. agent_memory (per-agent scratchpad — briefings, learned facts, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id          bigserial PRIMARY KEY,
  agent_slug  text NOT NULL REFERENCES public.agents(slug) ON DELETE CASCADE,
  kind        text NOT NULL,                              -- 'briefing', 'fact', 'pattern', etc.
  key         text,                                       -- optional unique per agent+kind+key
  value       jsonb NOT NULL,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_memory_lookup_idx
  ON public.agent_memory (agent_slug, kind, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_unique_key_idx
  ON public.agent_memory (agent_slug, kind, key)
  WHERE key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. agent_daily_spend (per-agent per-day USD reservation + actual)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_daily_spend (
  agent_slug    text NOT NULL REFERENCES public.agents(slug) ON DELETE CASCADE,
  day           date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  reserved_usd  numeric(10,6) NOT NULL DEFAULT 0,
  actual_usd    numeric(10,6) NOT NULL DEFAULT 0,
  call_count    integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_slug, day)
);

-- ----------------------------------------------------------------------------
-- 6. RPC: agent_try_spend  — atomic reserve against the daily cap
--      Returns true if reservation succeeded, false if cap would be exceeded.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_try_spend(
  p_agent_slug text,
  p_estimate_usd numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap     numeric;
  v_today   date := (now() AT TIME ZONE 'UTC')::date;
  v_current numeric;
BEGIN
  SELECT daily_spend_cap_usd INTO v_cap FROM public.agents WHERE slug = p_agent_slug;
  IF v_cap IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.agent_daily_spend (agent_slug, day, reserved_usd, actual_usd, call_count)
    VALUES (p_agent_slug, v_today, 0, 0, 0)
    ON CONFLICT (agent_slug, day) DO NOTHING;

  UPDATE public.agent_daily_spend
     SET reserved_usd = reserved_usd + p_estimate_usd,
         call_count   = call_count + 1,
         updated_at   = now()
   WHERE agent_slug = p_agent_slug AND day = v_today
   RETURNING reserved_usd + actual_usd INTO v_current;

  IF v_current > v_cap THEN
    -- roll back the reservation
    UPDATE public.agent_daily_spend
       SET reserved_usd = reserved_usd - p_estimate_usd,
           call_count   = call_count - 1,
           updated_at   = now()
     WHERE agent_slug = p_agent_slug AND day = v_today;
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: agent_reconcile_spend — convert reservation into actual cost
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_reconcile_spend(
  p_agent_slug text,
  p_estimate_usd numeric,
  p_actual_usd numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  UPDATE public.agent_daily_spend
     SET reserved_usd = GREATEST(reserved_usd - p_estimate_usd, 0),
         actual_usd   = actual_usd + p_actual_usd,
         updated_at   = now()
   WHERE agent_slug = p_agent_slug AND day = v_today;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RLS — admin-only via service role; deny to anon/authenticated.
-- ----------------------------------------------------------------------------
ALTER TABLE public.agents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_daily_spend  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agents','agent_events','agent_actions','agent_memory','agent_daily_spend'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.agent_try_spend(text, numeric)            TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_reconcile_spend(text, numeric, numeric) TO service_role;

-- ----------------------------------------------------------------------------
-- 9. Seed the 8 agents (all DISABLED by default; orchestrator + analyst flip on
--    via admin UI when ready).
-- ----------------------------------------------------------------------------
INSERT INTO public.agents (slug, display_name, description, enabled, autonomy, model, daily_spend_cap_usd, handles_events, endpoint)
VALUES
  ('orchestrator', 'Orchestrator',
    'Drains the agent_events bus every minute and routes each event to handler agents.',
    false, 'autonomous', 'claude-haiku-4-5-20251001', 1.00,
    ARRAY['*'], '/.netlify/functions/agent-orchestrator'),
  ('analyst', 'Analyst',
    'Nightly: rolls up 24h marketplace metrics and writes a Claude-generated briefing.',
    false, 'autonomous', 'claude-sonnet-4-5', 2.00,
    ARRAY['nightly.tick'], '/.netlify/functions/agent-analyst'),
  ('matchmaker', 'Matchmaker',
    'When a care plan auction closes, ranks bids and proposes a winner.',
    false, 'propose', 'claude-sonnet-4-5', 5.00,
    ARRAY['care_plan.auction_closed'], '/.netlify/functions/agent-matchmaker'),
  ('treasurer', 'Treasurer',
    'Watches escrow and payouts; proposes captures, refunds, and resolves payment edge cases.',
    false, 'propose', 'claude-sonnet-4-5', 5.00,
    ARRAY['payment.captured','payment.refund_requested','payout.failed'], '/.netlify/functions/agent-treasurer'),
  ('gatekeeper', 'Gatekeeper',
    'Reviews provider applications, KYC, and background check results; proposes approve/reject.',
    false, 'propose', 'claude-sonnet-4-5', 3.00,
    ARRAY['provider.applied','provider.bgc_completed','provider.flagged'], '/.netlify/functions/agent-gatekeeper'),
  ('concierge', 'Concierge',
    'Member-facing: triages support tickets, drafts replies, escalates the rest.',
    false, 'propose', 'claude-sonnet-4-5', 5.00,
    ARRAY['support.ticket_created','member.message_received'], '/.netlify/functions/agent-concierge'),
  ('advocate', 'Advocate',
    'Provider-facing: handles disputes, suspensions, and growth nudges.',
    false, 'propose', 'claude-sonnet-4-5', 4.00,
    ARRAY['dispute.opened','provider.suspended','provider.low_rating'], '/.netlify/functions/agent-advocate'),
  ('hunter', 'Hunter',
    'Outreach growth: scores leads, drafts campaigns, queues sends for admin approval.',
    false, 'propose', 'claude-sonnet-4-5', 4.00,
    ARRAY['lead.discovered','campaign.requested'], '/.netlify/functions/agent-hunter')
ON CONFLICT (slug) DO UPDATE
  SET description    = EXCLUDED.description,
      handles_events = EXCLUDED.handles_events,
      endpoint       = EXCLUDED.endpoint,
      updated_at     = now();

-- ----------------------------------------------------------------------------
-- 10. care_plan auction-closed trigger — emits the example event so the bus
--     has real traffic once Matchmaker is enabled. Guarded so it only fires if
--     the table/column exist.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'care_plans' AND column_name = 'status'
  ) THEN
    EXECUTE $TRG$
      CREATE OR REPLACE FUNCTION public.agent_emit_auction_closed()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $f$
      BEGIN
        IF NEW.status = 'auction_closed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
          INSERT INTO public.agent_events (event_type, payload, source)
          VALUES (
            'care_plan.auction_closed',
            jsonb_build_object('care_plan_id', NEW.id),
            'trigger:care_plans'
          );
        END IF;
        RETURN NEW;
      END;
      $f$;
    $TRG$;

    DROP TRIGGER IF EXISTS care_plan_auction_closed_emit ON public.care_plans;
    CREATE TRIGGER care_plan_auction_closed_emit
      AFTER UPDATE ON public.care_plans
      FOR EACH ROW
      EXECUTE FUNCTION public.agent_emit_auction_closed();
  END IF;
END $$;
