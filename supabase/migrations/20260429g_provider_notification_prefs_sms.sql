-- ════════════════════════════════════════════════════════════════════════════
-- Task #201 — Per-threshold SMS opt-in for BGC reminders.
--
-- Task #159 added per-provider on/off toggles for the BGC reminder *emails*
-- (60 / 30 / 14 / 7 / 1-day thresholds) on provider_notification_prefs.
--
-- Several providers asked for SMS-style nudges (often instead of, or in
-- addition to, email — e.g. mute the noisy 60-day heads-up email but text
-- the urgent 1-day reminder). This migration extends the same row with a
-- mirrored set of `_sms` flags plus an optional override phone number.
--
--   bgc_reminder_<N>_sms  BOOLEAN, default FALSE  (strictly opt-in — sending
--                                                  texts without an explicit
--                                                  consent flip would be a
--                                                  TCPA-style problem.)
--   sms_phone             TEXT,    nullable        (when NULL, the cron job
--                                                  falls back to
--                                                  profiles.phone — see
--                                                  netlify/functions/
--                                                  bgc-send-reminders.js)
--
-- Apply manually in the Supabase SQL editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.provider_notification_prefs
  ADD COLUMN IF NOT EXISTS bgc_reminder_60_sms BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bgc_reminder_30_sms BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bgc_reminder_14_sms BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bgc_reminder_7_sms  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bgc_reminder_1_sms  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_phone           TEXT;

-- No new RLS policies needed: the existing
--   providers_(read|insert|update)_own_notif_prefs  policies and the
--   service_role_notif_prefs policy already cover every column on this
--   table by row, so the new columns inherit the same access rules.
