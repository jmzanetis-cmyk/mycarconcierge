-- ============================================================================
-- MCC Agent Fleet — Task #122: spend-cap alert email delivery
--
-- Adds email_sent_at so the admin UI can show "Emailed at <time>" with proper
-- granularity (the existing email_sent boolean stays — both fields are written
-- atomically when a send succeeds, so this is purely additive).
-- ============================================================================

ALTER TABLE public.agent_spend_alerts
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
