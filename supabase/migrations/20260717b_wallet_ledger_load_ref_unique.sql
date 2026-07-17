-- ============================================================================
-- 20260717b — wallet_ledger: unique partial index on load-cash ref_id.
--
-- Phase 1 audit Finding #3 (MEDIUM dark-feature) — the wallet_load RPC
-- writes an INSERT to wallet_ledger with entry_type='load_cash' and
-- ref_id = the Stripe PI id, but has no idempotency guard. Stripe's
-- webhook redelivery (fires on our 5xx, timeout, or manual dashboard
-- replay) would double-credit the wallet.
--
-- The stripe-webhook idempotency gate (stripe_events table) is
-- deliberately fail-open on gate write error — a right choice to avoid
-- dropping real payments, but it means the downstream write MUST be
-- independently idempotent. wallet_load wasn't.
--
-- Fix: unique partial index scoped to LOAD entries only. Spend/transfer
-- entries may share ref_ids or lack them entirely (they use ref_id for
-- the care_plan_id or ride_id, and those are legitimately shared across
-- multiple spend rows or split-payment flows). Partial WHERE clause
-- keeps the index tight to the idempotency use case.
--
-- Caller (stripe-webhook.js wallet_load handler) catches 23505 as an
-- idempotent no-op — treated as "already credited, don't re-run."
--
-- Pre-check (2026-07-17): SELECT ref_id, COUNT(*) FROM wallet_ledger
-- WHERE entry_type='load_cash' AND ref_id IS NOT NULL GROUP BY ref_id
-- HAVING COUNT(*) > 1 → 0 rows. Index applies cleanly against current
-- prod data.
-- ============================================================================
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_load_ref_unique
  ON wallet_ledger (ref_id)
  WHERE entry_type = 'load_cash' AND ref_id IS NOT NULL;

COMMIT;
