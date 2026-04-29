-- ============================================================================
-- MCC Agent Fleet — Director (acquisition-focused chief of staff)
--
-- Adds the Director agent, an alert-state table (with dedupe semantics), and
-- the agents-row insert. The Director runs on a 15-minute cron, walks a
-- battery of "are the other agents actually bringing in customers" checks,
-- and pages the admin via SMS (Twilio) + email (Resend) when anything is
-- off. Each alert ships with a concrete next-action recommendation so the
-- text message is actionable, not just informational.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. agent_director_alerts — open/closed alert lifecycle + dedupe.
--    Keyed by alert_key (e.g. 'gatekeeper_failing', 'promoter_drafts_pile').
--    Only ONE open row per alert_key may exist at a time (partial unique idx).
--    When the underlying condition clears on a later sweep, the Director
--    sets resolved_at and a future re-occurrence is treated as a new alert.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_director_alerts (
  id              bigserial PRIMARY KEY,
  alert_key       text NOT NULL,
  severity        text NOT NULL
                  CHECK (severity IN ('critical','warning','info','digest')),
  title           text NOT NULL,
  body            text NOT NULL,
  next_action     text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  fire_count      integer NOT NULL DEFAULT 1,
  first_fired_at  timestamptz NOT NULL DEFAULT now(),
  last_fired_at   timestamptz NOT NULL DEFAULT now(),
  sms_sent_at     timestamptz,
  sms_error       text,
  email_sent_at   timestamptz,
  email_error     text,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one OPEN alert per key at a time. Resolved rows are kept for history.
CREATE UNIQUE INDEX IF NOT EXISTS agent_director_alerts_open_uniq
  ON public.agent_director_alerts (alert_key)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS agent_director_alerts_recent_idx
  ON public.agent_director_alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS agent_director_alerts_open_recent_idx
  ON public.agent_director_alerts (last_fired_at DESC)
  WHERE resolved_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. RLS — service-role-only, mirroring the existing fleet tables.
-- ----------------------------------------------------------------------------
ALTER TABLE public.agent_director_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_director_alerts'
      AND policyname = 'service_role_all'
  ) THEN
    EXECUTE 'CREATE POLICY service_role_all ON public.agent_director_alerts'
         || ' FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Register the Director in the agents table.
--    Enabled by default (it has no spend cost — uses no Claude calls; pure
--    DB scans + Twilio + Resend). autonomy='autonomous' because its only
--    "action" is paging the admin, which is by design fully delegated.
-- ----------------------------------------------------------------------------
INSERT INTO public.agents (
  slug, display_name, description, enabled, autonomy, model,
  daily_spend_cap_usd, handles_events, endpoint, config
) VALUES (
  'director',
  'Director',
  'Watches the other agents to make sure they are actually bringing in customers and pages the admin (SMS + email) with the specific next action when any acquisition lever stalls.',
  true,
  'autonomous',
  'claude-sonnet-4-5',
  0.0,
  ARRAY[]::text[],
  '/.netlify/functions/agent-director-scheduled',
  jsonb_build_object(
    'quiet_hours_utc',       jsonb_build_object('start', 2, 'end', 11),
    'digest_hour_utc',       11,
    'dedupe_repage_hours',   6,
    'thresholds', jsonb_build_object(
      'gatekeeper_error_min_in_6h', 2,
      'promoter_drafts_pile_min',   5,
      'promoter_idle_days',         7,
      'hunter_unscored_min_2h',     1,
      'social_dry_window_h',        24,
      'matchmaker_unranked_min_h',  1,
      'signup_drop_pct',            50
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  description         = EXCLUDED.description,
  endpoint            = EXCLUDED.endpoint,
  handles_events      = EXCLUDED.handles_events,
  daily_spend_cap_usd = EXCLUDED.daily_spend_cap_usd,
  -- Preserve operator-edited config; only seed it on first install.
  config              = COALESCE(public.agents.config, EXCLUDED.config),
  updated_at          = now();
