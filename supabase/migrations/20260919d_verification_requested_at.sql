-- ============================================================================
-- Additive column for the provider verification-request flow (Phase 3).
--
-- profiles.verification_status already exists (added by 20260619a) with a
-- three-state CHECK constraint (NULL | 'pending' | 'verified' | 'rejected').
-- The verify-request endpoint sets status='pending' and stamps this new
-- column with the request time so admins can prioritise the queue by
-- age and providers can see "Under review — submitted <date>" in the UI.
--
-- Column is nullable — existing 'verified' rows (grandfathered) don't have
-- a request timestamp and shouldn't be back-filled artificially.
--
-- verification_status is a privileged column guarded by 20260918c's BEFORE
-- UPDATE trigger; verification_requested_at is INTENTIONALLY not added to
-- the guard list — it moves in lockstep with status via the same service-
-- role endpoint (/api/provider/request-verification), and the trigger
-- already blocks client-side status writes, which is where the risk is.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz;

COMMENT ON COLUMN public.profiles.verification_requested_at IS
  'When the provider requested verification (verification_status transition '
  'to pending) via /api/provider/request-verification. NULL for rows that '
  'never went through the request flow (grandfathered verified providers).';
