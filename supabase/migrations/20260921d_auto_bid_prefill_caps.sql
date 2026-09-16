-- ============================================================================
-- 20260921d_auto_bid_prefill_caps.sql
--
-- Phase 7 of the auto-bid redesign (caps, ledger, cleanup). Adds the soft
-- daily cap on *prefills sent* per provider, called out in the original
-- design doc: notification fatigue is a real failure mode even with a
-- human tap required, since nothing is placed without that tap. Default
-- stays unlimited — this is capacity for a provider (or Jordan, on their
-- behalf) to dial down later if it becomes a problem, not a default
-- restriction.
--
-- Lives on provider_notification_preferences (not provider_rate_card_items
-- or a new table) because it's a per-provider notification preference,
-- same category as push_auto_bid_prefill added in Phase 4's migration.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ============================================================================

ALTER TABLE public.provider_notification_preferences
  ADD COLUMN IF NOT EXISTS auto_bid_prefill_daily_cap integer;

ALTER TABLE public.provider_notification_preferences
  DROP CONSTRAINT IF EXISTS provider_notification_preferences_auto_bid_prefill_daily_cap_check;

ALTER TABLE public.provider_notification_preferences
  ADD CONSTRAINT provider_notification_preferences_auto_bid_prefill_daily_cap_check
  CHECK (auto_bid_prefill_daily_cap IS NULL OR auto_bid_prefill_daily_cap > 0);
