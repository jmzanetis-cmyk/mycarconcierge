-- ============================================================================
-- Social Acquisition foundation
--
-- Adds the persistence layer for inbound social-media lead discovery and
-- outbound social posting. The agents themselves (Hunter for inbound,
-- Promoter for outbound) are driven by the existing agent_events bus and
-- write their proposals to agent_actions with needs_review=true so every
-- decision still queues for the operator. This migration also:
--   - registers the new Promoter agent (enabled=false, propose autonomy)
--   - extends Hunter's handles_events to include social.lead_discovered
--
-- Apply via Supabase SQL Editor.
-- ============================================================================

-- 1. social_channels: per-platform connection rows. credentials_ref is a
-- soft pointer to a Netlify env var name (e.g. "REDDIT_REFRESH_TOKEN") so
-- secrets stay out of the database. enabled=false means stay in mock mode
-- even if creds are present.
CREATE TABLE IF NOT EXISTS public.social_channels (
  id              bigserial PRIMARY KEY,
  platform        text NOT NULL CHECK (platform IN ('reddit','x','facebook','instagram','tiktok','linkedin')),
  handle          text,
  monitor_keywords text[] NOT NULL DEFAULT '{}',
  monitor_audience text NOT NULL DEFAULT 'both' CHECK (monitor_audience IN ('member','provider','both')),
  credentials_ref text,
  enabled         boolean NOT NULL DEFAULT false,
  last_polled_at  timestamptz,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

-- 2. social_leads: inbound prospects discovered by the monitor cron and
-- scored by Hunter. status drives the operator workflow:
--   pending    — waiting on Hunter to score
--   scored     — Hunter has proposed; admin sees in review queue
--   approved   — admin OK'd the lead (Hunter or future agents may act)
--   contacted  — outreach sent
--   rejected   — admin discarded
CREATE TABLE IF NOT EXISTS public.social_leads (
  id              bigserial PRIMARY KEY,
  platform        text NOT NULL,
  external_id     text,
  profile_url     text,
  author_handle   text,
  raw_text        text,
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_type       text CHECK (lead_type IN ('member','provider','unknown')),
  score           numeric(3,2),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','scored','approved','contacted','rejected')),
  agent_action_id bigint REFERENCES public.agent_actions(id) ON DELETE SET NULL,
  channel_id      bigint REFERENCES public.social_channels(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS social_leads_status_idx ON public.social_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS social_leads_platform_idx ON public.social_leads (platform, created_at DESC);

-- 3. social_posts: outbound content drafts produced by Promoter.
--   draft       — generated, not yet reviewed
--   approved    — admin OK'd; ready for publish
--   published   — sent through the channel adapter
--   rejected    — admin discarded
CREATE TABLE IF NOT EXISTS public.social_posts (
  id              bigserial PRIMARY KEY,
  platform        text NOT NULL,
  channel_id      bigint REFERENCES public.social_channels(id) ON DELETE SET NULL,
  audience        text NOT NULL CHECK (audience IN ('member','provider','mixed')),
  body            text NOT NULL,
  media_urls      text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','published','rejected')),
  scheduled_for   timestamptz,
  published_at    timestamptz,
  external_post_id text,
  agent_action_id bigint REFERENCES public.agent_actions(id) ON DELETE SET NULL,
  reviewed_by     text,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_posts_status_idx ON public.social_posts (status, created_at DESC);

-- updated_at triggers (re-uses the standard pattern in this codebase).
CREATE OR REPLACE FUNCTION public.touch_social_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS social_channels_touch ON public.social_channels;
CREATE TRIGGER social_channels_touch BEFORE UPDATE ON public.social_channels
  FOR EACH ROW EXECUTE FUNCTION public.touch_social_updated_at();

DROP TRIGGER IF EXISTS social_leads_touch ON public.social_leads;
CREATE TRIGGER social_leads_touch BEFORE UPDATE ON public.social_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_social_updated_at();

DROP TRIGGER IF EXISTS social_posts_touch ON public.social_posts;
CREATE TRIGGER social_posts_touch BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_social_updated_at();

ALTER TABLE public.social_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts    ENABLE ROW LEVEL SECURITY;
-- Service-role only; admin endpoints use service-role client.

-- ----------------------------------------------------------------------------
-- 4. Register Promoter agent. Hunter is already seeded; we extend its
-- handles_events to include the new social.lead_discovered topic.
-- ----------------------------------------------------------------------------
INSERT INTO public.agents
  (slug, display_name, description, enabled, autonomy, model, daily_spend_cap_usd, handles_events, endpoint)
VALUES
  ('promoter', 'Promoter',
    'Drafts outbound social-media posts for member and provider acquisition. Every draft queues for human review before publish.',
    false, 'propose', 'claude-sonnet-4-5', 4.00,
    ARRAY['social.post_requested'], '/.netlify/functions/agent-promoter')
ON CONFLICT (slug) DO UPDATE
  SET description    = EXCLUDED.description,
      handles_events = EXCLUDED.handles_events,
      endpoint       = EXCLUDED.endpoint,
      updated_at     = now();

UPDATE public.agents
   SET handles_events = ARRAY['lead.discovered','campaign.requested','social.lead_discovered']
 WHERE slug = 'hunter';
