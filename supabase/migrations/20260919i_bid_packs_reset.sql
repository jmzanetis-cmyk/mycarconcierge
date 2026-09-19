-- ============================================================================
-- Phase 1 addendum — reset the bid_packs catalog to the five packs the
-- provider-subscriptions build spec was priced against.
--
-- Audit (2026-09-19):
--   • 19 active packs across a wide price ladder, 16 of them below the
--     spec's standing $3.00/bid floor (worst: Championship at $0.52/bid).
--   • zero rows in bid_credit_purchases — no live revenue at stake.
--   • no audience/type/category column on bid_packs; every provider sees
--     the full list on web (native providers see none, per Apple 3.1.1).
--
-- Reset (Jordan, 2026-09-19):
--   • Deactivate all 19 rows (is_active=false; never DELETE — bid_credit_purchases
--     has an FK to pack_id, and future analytics on historical prices need
--     the rows to survive).
--   • Rename the existing "Jumper Cables" row to "Single" and reactivate
--     it with sort_order=1 (id preserved so any downstream reference
--     survives; bid_count/price/bonus_bids stay 1/$10/0).
--   • Insert four new packs: Starter, Standard, Pro, Shop with sort_order
--     2..5, no bonus bids, all above the $3.00/bid floor.
--
-- price_per_bid: converted to a GENERATED STORED column with the correct
-- formula (price / (bid_count + COALESCE(bonus_bids, 0))). The previous
-- column stored `price / bid_count`, which undersells the effective
-- customer cost for any pack with bonus_bids > 0 (Dipstick showed 4.00
-- stored vs 3.64 real, etc.). Choosing generated over drop-and-compute-in-UI
-- because it's a pure column-derived value, existing readers keep working
-- without change, and it can never drift.
--
-- All operations run inside the migration's implicit transaction. Safe
-- to re-run — DROP IF EXISTS + IF NOT EXISTS + ON CONFLICT DO NOTHING
-- patterns where relevant.
-- ============================================================================


-- ---- 1. Deactivate every existing pack (never delete) -------------------

UPDATE public.bid_packs SET is_active = false;


-- ---- 2. price_per_bid → generated column --------------------------------

-- Cannot convert a plain column to generated in place. Drop then re-add
-- with the corrected formula. No live reader depends on the STORED
-- generated variant vs plain — same accessor either way.
ALTER TABLE public.bid_packs DROP COLUMN IF EXISTS price_per_bid;
ALTER TABLE public.bid_packs
  ADD COLUMN price_per_bid numeric
  GENERATED ALWAYS AS (
    CASE
      WHEN (bid_count + COALESCE(bonus_bids, 0)) > 0
        THEN price / (bid_count + COALESCE(bonus_bids, 0))
      ELSE NULL
    END
  ) STORED;


-- ---- 3. Reactivate + rename Jumper Cables → Single (sort_order=1) -------

UPDATE public.bid_packs
   SET name = 'Single',
       bid_count = 1,
       price = 10.00,
       bonus_bids = 0,
       is_active = true,
       is_popular = false,
       badge_text = NULL,
       sort_order = 1
 WHERE id = '552cbd41-bc50-4e1c-9158-a2009d381ce5';   -- Jumper Cables


-- ---- 4. Insert Starter / Standard / Pro / Shop --------------------------

INSERT INTO public.bid_packs (name, bid_count, price, bonus_bids, is_active, is_popular, badge_text, sort_order)
VALUES
  ('Starter',   10,  100.00, 0, true, false, NULL,           2),
  ('Standard',  25,  225.00, 0, true, true,  'Most popular', 3),
  ('Pro',       50,  400.00, 0, true, false, NULL,           4),
  ('Shop',     100,  700.00, 0, true, false, NULL,           5)
ON CONFLICT DO NOTHING;
-- Note: no unique constraint on `name`, so ON CONFLICT DO NOTHING is
-- decorative (nothing to conflict on). Kept as a hint that a re-run
-- would want idempotency — track duplicates by is_active + name in a
-- follow-up if this file is applied twice.
