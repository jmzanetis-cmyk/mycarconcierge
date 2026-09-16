-- ============================================================================
-- 20260921c_auto_bid_prefills.sql
--
-- Phase 4 of the auto-bid redesign. One row per (provider, care_plan) that
-- the prefill-notify engine has fired on. The row itself is the durable
-- record of the notification ("we told this provider about this job at
-- $X"); the push notification is best-effort.
--
-- WHY THIS EXISTS AS A TABLE, not just an ephemeral push:
--   - Idempotency backstop: the UNIQUE (provider_id, care_plan_id)
--     constraint is what actually stops duplicate notifies if the
--     scheduled function overruns or double-fires. The scheduler does a
--     pre-check too, but the UNIQUE is the real guarantee.
--   - Phase 5 (the review/confirm screen) reads this table to render the
--     provider's inbox — "here are the jobs we prefilled a bid for." Push
--     is unreliable; the in-app inbox has to work regardless.
--   - Phase 7 rate-limiting will read this table's counts (how many
--     prefills has this provider received in the last 24h) to decide
--     whether to skip.
--
-- STATUS field:
--   'pending' — inserted by the notify engine, provider hasn't reviewed yet
--   'confirmed' — provider tapped through to place the bid (Phase 5)
--   'dismissed' — provider tapped "not interested" (Phase 5)
--   'expired' — the care_plan closed/expired before the provider acted
--   Phase 4 only writes 'pending'; the other three values are the shape
--   Phase 5's confirm/dismiss endpoint will use.
--
-- RLS shape (Phase 4 only writes; provider only reads):
--   prci_self_read      — provider sees their own prefill rows
--   prci_service_all    — service_role bypasses (the scheduled function
--                         writes with service_role)
--   NO self_upsert/self_update yet. Phase 5's confirm/dismiss endpoint
--   will run under service_role and add self_update or a specialized
--   policy at that time. Don't add it speculatively.
--
-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS ...
-- CREATE POLICY. Re-runs safely.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auto_bid_prefills (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  care_plan_id           uuid NOT NULL REFERENCES public.care_plans(id) ON DELETE CASCADE,
  item_key               text NOT NULL REFERENCES public.service_menu_items(item_key),
  prefilled_amount_cents integer NOT NULL,
  status                 text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'confirmed', 'dismissed', 'expired')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  responded_at           timestamptz,
  UNIQUE (provider_id, care_plan_id)
);

-- Fast read paths: "this provider's inbox" (Phase 5) and "how many prefills
-- in the last 24h for rate-limiting" (Phase 7).
CREATE INDEX IF NOT EXISTS auto_bid_prefills_provider_created_idx
  ON public.auto_bid_prefills (provider_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — self_read only + service_all. See file header for why no self_update.
-- ---------------------------------------------------------------------------
ALTER TABLE public.auto_bid_prefills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abp_self_read   ON public.auto_bid_prefills;
DROP POLICY IF EXISTS abp_service_all ON public.auto_bid_prefills;

CREATE POLICY abp_self_read ON public.auto_bid_prefills
  FOR SELECT TO authenticated
  USING (provider_id = auth.uid());

CREATE POLICY abp_service_all ON public.auto_bid_prefills
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Notification preference column. Mirrors push_bid_accepted's shape exactly
-- (BOOLEAN DEFAULT true) — a fresh row from any existing writer that
-- doesn't know about this column gets opted-in by default, same as every
-- other push category. Providers can opt out from Settings later.
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_notification_preferences
  ADD COLUMN IF NOT EXISTS push_auto_bid_prefill BOOLEAN DEFAULT true;
