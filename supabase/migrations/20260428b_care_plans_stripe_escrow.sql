-- Task #155: Wire Stripe escrow to care plans (Medium/Full payment fix)
--
-- Extends the Light fix (20260428_care_plan_completions.sql) so that care
-- plan jobs flow through real Stripe manual-capture PaymentIntents. Members
-- pay when they accept a bid (funds held), funds are captured when work is
-- marked complete (with a founder commission split if the provider was
-- referred by a founder), and disputes hold capture so admins can refund.
--
-- Run this in Supabase Dashboard -> SQL Editor.

-- ============================================================
-- 1. CARE_PLANS — escrow / payment tracking columns
-- ============================================================
ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS accepted_bid_id UUID REFERENCES public.plan_bids(id) ON DELETE SET NULL;

ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS escrow_amount NUMERIC(10,2);

-- Snapshot of the provider's Stripe Connect account ID at the time funds
-- were held — protects against the provider disconnecting Stripe later
-- and leaving us unable to identify the destination.
ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS provider_stripe_account_id TEXT;

-- payment_status lifecycle:
--   none           — no PaymentIntent yet
--   requires_payment — PaymentIntent created, awaiting member confirmation
--   held           — funds authorized & held in escrow (manual capture)
--   captured       — funds released to provider via Connect
--   refunded       — admin refunded the member (no provider payout)
--   partially_refunded — partial admin refund
--   disputed       — member raised a dispute (capture frozen)
--   cancelled      — PaymentIntent cancelled (auto-cancel after 7d auth window)
--   failed         — PaymentIntent failed at confirmation time
ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none';

-- Drop the legacy CHECK if it was added by a prior re-run, then re-add with the full lifecycle.
ALTER TABLE public.care_plans DROP CONSTRAINT IF EXISTS care_plans_payment_status_check;
ALTER TABLE public.care_plans ADD CONSTRAINT care_plans_payment_status_check
  CHECK (payment_status IN ('none','requires_payment','held','captured','refunded','partially_refunded','disputed','cancelled','failed'));

CREATE INDEX IF NOT EXISTS idx_care_plans_payment_status ON public.care_plans(payment_status);
CREATE INDEX IF NOT EXISTS idx_care_plans_stripe_pi ON public.care_plans(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_care_plans_accepted_bid ON public.care_plans(accepted_bid_id);

-- ============================================================
-- 2. CARE_PLAN_COMPLETIONS — capture / refund / commission tracking
-- ============================================================
ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS captured_amount NUMERIC(10,2);

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2);

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS refund_id TEXT;

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS founder_commission_amount NUMERIC(10,2);

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS founder_transfer_id TEXT;

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS founder_commission_status TEXT;

ALTER TABLE public.care_plan_completions DROP CONSTRAINT IF EXISTS cpc_founder_commission_status_check;
ALTER TABLE public.care_plan_completions ADD CONSTRAINT cpc_founder_commission_status_check
  CHECK (founder_commission_status IS NULL OR founder_commission_status IN ('skipped','pending','paid','failed'));

-- payment_capture_status mirrors care_plans.payment_status post-completion
-- but stored on the completion row for AI Ops + audit lookups.
ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS payment_capture_status TEXT;

ALTER TABLE public.care_plan_completions DROP CONSTRAINT IF EXISTS cpc_payment_capture_status_check;
ALTER TABLE public.care_plan_completions ADD CONSTRAINT cpc_payment_capture_status_check
  CHECK (payment_capture_status IS NULL OR payment_capture_status IN ('pending','captured','refunded','partially_refunded','failed'));

CREATE INDEX IF NOT EXISTS idx_cpc_stripe_pi ON public.care_plan_completions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_cpc_capture_status ON public.care_plan_completions(payment_capture_status);

-- ============================================================
-- 3. RLS additions are NOT required — care_plans existing policies already
-- cover the new columns (members manage own; verified providers SELECT open).
-- All Stripe-side mutations flow through server.js with the service-role key
-- which bypasses RLS.
-- ============================================================
