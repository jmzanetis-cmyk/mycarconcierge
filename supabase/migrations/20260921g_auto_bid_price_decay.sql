-- ============================================================================
-- 20260921g_auto_bid_price_decay.sql
--
-- Auto-Bid price decay — adds an optional per-item minimum price on a
-- provider's rate card, plus a shared "when was this bid's amount last
-- moved" timestamp on plan_bids that decay + manual "Update Bid" both
-- write. Sits alongside Phase 8's automatic submission as an independent
-- refinement; on a Phase-8-less database the columns exist and are
-- populated but nothing reads them (until the new decay scheduled fn
-- lands).
--
-- WHY IT'S SAFE (guardrail):
--   Decay reacts only to a binary "is this job contested" check and a
--   clock. Never to any competitor's actual bid amount. See the design
--   spec's "Guardrail" section — the whole point is to keep MCC clear of
--   any "facilitates price coordination between competitors" concern.
--   Nothing in this schema stores or requires storing a competitor's
--   amount; the contested check is an existence-only query on
--   plan_bids rows scoped by care_plan_id.
--
-- SCHEMA:
--   1. provider_rate_card_items.min_price_cents integer NULL
--      CHECK (min_price_cents IS NULL OR (min_price_cents > 0 AND
--             min_price_cents <= price_cents))
--      Null = decay opt-out for this item (default). Every existing row
--      keeps today's behavior unchanged. The <= price_cents constraint
--      catches min > max at write time so we don't need runtime guards.
--
--   2. plan_bids.last_price_change_at timestamptz NULL
--      Updated by decay AND by manual Update-Bid edits. One column
--      covers both cases: decay needs "when was the amount last moved,
--      regardless of by whom" to schedule the next step. NULL on legacy
--      rows == "never moved" == treated as if it moved at created_at
--      (the JS caller falls back to created_at when the column is null).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS +
-- ADD CONSTRAINT. Safe to re-run.
-- ============================================================================

-- 1. Rate card items: optional decay floor per item.
ALTER TABLE public.provider_rate_card_items
  ADD COLUMN IF NOT EXISTS min_price_cents integer;

ALTER TABLE public.provider_rate_card_items
  DROP CONSTRAINT IF EXISTS provider_rate_card_items_min_price_cents_check;
ALTER TABLE public.provider_rate_card_items
  ADD CONSTRAINT provider_rate_card_items_min_price_cents_check
  CHECK (min_price_cents IS NULL
         OR (min_price_cents > 0 AND min_price_cents <= price_cents));

-- 2. plan_bids: last-price-change timestamp shared between decay + manual edits.
ALTER TABLE public.plan_bids
  ADD COLUMN IF NOT EXISTS last_price_change_at timestamptz;

-- Fast query path for the decay engine: "give me pending auto-bids whose
-- last price move is older than <step-interval>". Partial index because
-- 99%+ of plan_bids rows are is_auto_bid=false (Phase 5 manual confirms)
-- and this index only needs to serve auto-bid decay lookups.
CREATE INDEX IF NOT EXISTS plan_bids_auto_bid_pending_last_change_idx
  ON public.plan_bids (last_price_change_at, care_plan_id)
  WHERE is_auto_bid = true AND status = 'pending';
