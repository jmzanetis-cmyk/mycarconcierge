-- ============================================================================
-- Phase 1 backfill correction.
--
-- 20260919g's backfill had a subtle bug: the two INSERT statements shared a
-- transaction, and the AFTER INSERT trigger on credit_ledger recomputed
-- profiles.free_trial_bids from the (empty at that point) founder/trial
-- ledger sum as each opening row landed. That zeroed the cache before the
-- second INSERT statement's SELECT ran, so profiles that had BOTH
-- bid_credits > 0 AND free_trial_bids > 0 lost their trial rows to the
-- second INSERT's `WHERE free_trial_bids > 0` filter.
--
-- Prod impact: two profiles, 8 credits total.
--   • Chris Agrapidis (dbb15523…): 3 trial credits lost.
--   • Reviewer Provider (cfadd663…): 5 trial credits lost.
--
-- The zero-drift assertion still passed because cache and ledger both
-- reflected the post-zeroing state — but the sums are 8 short of the
-- pre-migration reality.
--
-- This migration inserts the missing rows so the ledger matches the
-- pre-Phase-1 balances the providers actually had. Fresh clones apply
-- the fixed 20260919g (temp-table pattern) instead — see the file
-- header there.
-- ============================================================================

INSERT INTO public.credit_ledger (provider_id, delta, source, created_at, ref_type, ref_id)
SELECT
  p.id,
  CASE
    WHEN p.id = 'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2' THEN 3   -- Chris
    WHEN p.id = 'cfadd663-ec20-41b0-bc35-92b20f7d746c' THEN 5   -- Reviewer
  END,
  'trial',
  COALESCE(p.created_at, now()),
  'phase1_backfill_correction',
  '20260919k'
FROM public.profiles p
WHERE p.id IN (
  'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2',
  'cfadd663-ec20-41b0-bc35-92b20f7d746c'
)
-- Idempotency: skip if a correction row already exists for that provider.
AND NOT EXISTS (
  SELECT 1 FROM public.credit_ledger cl
   WHERE cl.provider_id = p.id
     AND cl.ref_type = 'phase1_backfill_correction'
);

-- The AFTER INSERT trigger on credit_ledger recomputes both cache columns
-- for each affected provider automatically. No manual cache update needed.
