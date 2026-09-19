-- ============================================================================
-- Phase 1 §1.5 — credit-ledger drift check.
--
-- Assertion: for every profile, sum(ledger.delta) equals the cache values
-- profiles.bid_credits + profiles.free_trial_bids. Any deviation is drift.
-- Every writer moved to the ledger in Phase 1 §1.4, and the cache trigger
-- on credit_ledger AFTER INSERT keeps profiles synced. Drift can only
-- appear if a writer was missed OR someone updates profiles directly.
--
-- Returns 0 rows on success. Any row is a bug — investigate the affected
-- provider_id, look at the last few credit_ledger + audit_log entries.
--
-- Called by the drift-check scheduled function daily; safe to re-run.
-- ============================================================================

SELECT
  p.id                                                      AS provider_id,
  p.email,
  p.role,
  COALESCE(p.bid_credits, 0)      AS cache_bid_credits,
  COALESCE(p.free_trial_bids, 0)  AS cache_free_trial,
  COALESCE(l.sum_delta, 0)        AS ledger_sum,
  COALESCE(p.bid_credits, 0) + COALESCE(p.free_trial_bids, 0)
                                  AS cache_total,
  COALESCE(l.sum_delta, 0)
    - (COALESCE(p.bid_credits, 0) + COALESCE(p.free_trial_bids, 0))
                                  AS drift
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT SUM(delta) AS sum_delta
    FROM public.credit_ledger
   WHERE provider_id = p.id
) l ON TRUE
WHERE COALESCE(l.sum_delta, 0)
      <> (COALESCE(p.bid_credits, 0) + COALESCE(p.free_trial_bids, 0))
ORDER BY drift DESC;
