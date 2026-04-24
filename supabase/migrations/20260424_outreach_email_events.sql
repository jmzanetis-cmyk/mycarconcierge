-- ============================================================================
-- Migration: outreach_email_events
-- ----------------------------------------------------------------------------
-- Creates the granular per-event log table referenced by:
--   netlify/functions/outreach-resend-webhook.js  (Resend webhook handler)
--   netlify/functions/email-tracking.js           (in-app pixel/click redirector)
--
-- Inserts into this table are intentionally fire-and-forget in the handlers
-- (.then(()=>{}).catch(()=>{}) wrappers), which is why the table being
-- missing did not surface as a 500 — failures were silently swallowed and
-- no per-event audit trail was being written. With this table present,
-- every email.opened / email.clicked / email.bounced / email.complained
-- webhook call will append a row here in addition to stamping the
-- aggregated state on outreach_messages and outreach_leads.
--
-- Apply MANUALLY via Supabase SQL Editor (same workflow as the prior
-- 20260420_outreach_engine_initial.sql and 20260425_outreach_crm_bridge.sql
-- migrations).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_email_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid        REFERENCES public.outreach_messages(id) ON DELETE CASCADE,
  lead_id     uuid        REFERENCES public.outreach_leads(id)    ON DELETE CASCADE,
  event_type  text        NOT NULL CHECK (event_type IN (
                            'opened','clicked','bounced','complaint','delivered'
                          )),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_email_events_message_id
  ON public.outreach_email_events(message_id);
CREATE INDEX IF NOT EXISTS idx_outreach_email_events_lead_id
  ON public.outreach_email_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_email_events_event_type
  ON public.outreach_email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_outreach_email_events_occurred_at_desc
  ON public.outreach_email_events(occurred_at DESC);

-- RLS on; backend writes use the service role and bypass RLS automatically.
-- No policies needed because nothing in the browser ever queries this table.
ALTER TABLE public.outreach_email_events ENABLE ROW LEVEL SECURITY;
