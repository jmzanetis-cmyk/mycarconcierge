-- ============================================================================
-- 20260717c — member_credits: unique partial index on (member_id, referral_id).
--
-- Phase 1 audit Finding #4 (MEDIUM-HIGH latent) — backstop for the
-- _grantPendingReferralCredits race guard. The JS-level guard has been
-- fixed to verify row-count via .select('id') (see stripe-webhook.js),
-- but the DB backstop makes double-grants impossible even if a future
-- code change re-introduces the race.
--
-- INDEX SHAPE (CRITICAL) — (member_id, referral_id), NOT (referral_id, type).
-- Each valid grant writes TWO rows sharing the same referral_id:
--   - referrer's credit  (member_id = referrer_id, referral_id = X, type = 'referral')
--   - referred's credit  (member_id = referred_id, referral_id = X, type = 'referral')
-- A UNIQUE (referral_id, type) index would block the legitimate second-
-- party insert because both rows share (referral_id, 'referral').
-- The (member_id, referral_id) shape allows two rows per referral
-- (different member_ids) but blocks a duplicate grant for the same member.
--
-- Pre-check (2026-07-17): SELECT member_id, referral_id, COUNT(*)
-- FROM member_credits WHERE referral_id IS NOT NULL GROUP BY
-- member_id, referral_id HAVING COUNT(*) > 1 → 0 rows. Index applies
-- cleanly against current prod data.
--
-- Partial WHERE clause: other member_credits entries (spend redemptions,
-- promo grants, etc.) legitimately lack referral_id — indexing them
-- would waste space and prevent legit inserts with NULL referral_id.
-- ============================================================================
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS member_credits_referral_unique
  ON member_credits (member_id, referral_id)
  WHERE referral_id IS NOT NULL;

COMMIT;
