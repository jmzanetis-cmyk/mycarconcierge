-- ============================================================================
-- Task #205 — Add SMS alert tracking columns to agent_smoke_runs
--
-- The Gatekeeper daily smoke check now also pages the admin via Twilio SMS
-- (in addition to the Resend email from Task #161) so a failure is detected
-- much faster than waiting on email. We mirror the alert_email_* shape:
-- a boolean for "sent ok" and a text column for the last error string.
-- ============================================================================

ALTER TABLE public.agent_smoke_runs
  ADD COLUMN IF NOT EXISTS alert_sms_sent  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_sms_error text;
