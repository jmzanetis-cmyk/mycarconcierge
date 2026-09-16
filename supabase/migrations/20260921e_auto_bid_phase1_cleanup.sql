-- ============================================================================
-- 20260921e_auto_bid_phase1_cleanup.sql
--
-- Phase 7 of the auto-bid redesign (caps, ledger, cleanup). Drops the
-- columns belonging to the OLD, now-permanently-repaused auto-bid engine
-- (see fix/repause-auto-bid-engine, commit 4af7eac on main) — the
-- percent-of-estimate design this whole redesign replaced. The new system
-- (service_menu_items / provider_rate_card_items / auto_bid_prefills) has
-- fully replaced what these columns did.
--
-- ============================================================================
-- THIS MIGRATION IS DESTRUCTIVE AND NOT REVERSIBLE BY RE-RUNNING IT.
-- Every column below was independently re-verified as having zero readers
-- and zero writers anywhere in netlify/functions/*.js or www/*.js as of
-- 2026-09-16 (grepped fresh, not just trusting the earlier design-doc
-- audit) before this file was written. Do not run this against production
-- without a fresh confirmation that nothing new has started reading them
-- since — this migration file existing does not mean it has been applied.
-- ============================================================================
--
-- provider_auto_bid_settings.max_bid_percent / .service_categories:
--   only ever read/written by netlify/functions/auto-bid.js and
--   auto-bid-engine-scheduled.js — both already dead (netlify.toml's
--   scheduled block is commented out; auto-bid.js's POST returns
--   unconditional 403 auto_bid_paused before touching either column).
--   The table itself is NOT dropped — service_categories the *reference
--   table* (public.service_categories, from 20260920a) is a different
--   object entirely and is very much still alive; only these two columns
--   on provider_auto_bid_settings go.
--
-- profiles.auto_bid_enabled / .auto_bid_max_distance_miles /
-- .auto_bid_service_types / .auto_bid_percent_of_estimate:
--   added in 20260328_job_board.sql for the original (pre-provider_auto_
--   bid_settings) auto-bid design. Confirmed zero references anywhere in
--   the current codebase — even the old, now-dead auto-bid.js reads/writes
--   provider_auto_bid_settings, not these profiles columns. Pure dead
--   weight.
--
-- IDEMPOTENT: DROP COLUMN IF EXISTS — safe to re-run (a second run is a
-- no-op, not an error), but "idempotent" here means "won't fail if you
-- run it twice," not "reversible." There is no data to lose in these
-- columns today (all-default / unused), but confirm that's still true
-- before running this for real.
-- ============================================================================

ALTER TABLE public.provider_auto_bid_settings
  DROP COLUMN IF EXISTS max_bid_percent;

ALTER TABLE public.provider_auto_bid_settings
  DROP COLUMN IF EXISTS service_categories;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS auto_bid_enabled;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS auto_bid_max_distance_miles;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS auto_bid_service_types;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS auto_bid_percent_of_estimate;
