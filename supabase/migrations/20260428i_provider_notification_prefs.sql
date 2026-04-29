-- ════════════════════════════════════════════════════════════════════════════
-- Task #159 — Provider-customizable BGC reminder preferences.
--
-- Up to now, netlify/functions/bgc-send-reminders.js fired reminder emails on
-- a fixed 60 / 30 / 14 / 7-day ladder for every provider. Larger shops have
-- asked to mute the early reminders or to add a "1-day before" final nudge.
--
-- This migration adds a per-provider preferences row driving which reminders
-- the daily job emits. One row per provider (provider_id is the PK so an
-- UPSERT from the browser is straightforward). All four legacy thresholds
-- default to TRUE so existing providers see *no* behaviour change until they
-- flip something off; the new 1-day reminder defaults to FALSE so it is
-- strictly opt-in.
--
-- Apply manually in the Supabase SQL editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.provider_notification_prefs (
  provider_id      UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  bgc_reminder_60  BOOLEAN NOT NULL DEFAULT TRUE,
  bgc_reminder_30  BOOLEAN NOT NULL DEFAULT TRUE,
  bgc_reminder_14  BOOLEAN NOT NULL DEFAULT TRUE,
  bgc_reminder_7   BOOLEAN NOT NULL DEFAULT TRUE,
  bgc_reminder_1   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep updated_at fresh on every change so the UI can show "last saved" if
-- we ever surface it. Mirrors the pattern used elsewhere in the codebase.
CREATE OR REPLACE FUNCTION public.touch_provider_notification_prefs()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_provider_notification_prefs
  ON public.provider_notification_prefs;
CREATE TRIGGER trg_touch_provider_notification_prefs
  BEFORE UPDATE ON public.provider_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_provider_notification_prefs();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.provider_notification_prefs ENABLE ROW LEVEL SECURITY;

-- Providers can read, insert, and update their own row only. The bgc-send-
-- reminders Netlify function uses the service-role key and bypasses RLS.
DROP POLICY IF EXISTS "providers_read_own_notif_prefs" ON public.provider_notification_prefs;
CREATE POLICY "providers_read_own_notif_prefs"
  ON public.provider_notification_prefs FOR SELECT
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "providers_insert_own_notif_prefs" ON public.provider_notification_prefs;
CREATE POLICY "providers_insert_own_notif_prefs"
  ON public.provider_notification_prefs FOR INSERT
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS "providers_update_own_notif_prefs" ON public.provider_notification_prefs;
CREATE POLICY "providers_update_own_notif_prefs"
  ON public.provider_notification_prefs FOR UPDATE
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS "service_role_notif_prefs" ON public.provider_notification_prefs;
CREATE POLICY "service_role_notif_prefs"
  ON public.provider_notification_prefs FOR ALL
  TO service_role USING (true);
