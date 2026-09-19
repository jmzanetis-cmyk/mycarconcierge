-- ============================================================================
-- Phase 2 schema — provider subscriptions + one-path commission accrual.
--
-- Five new tables and one unique index, per docs/specs/provider-subscriptions-
-- build-spec.md §2.2 + §2.6:
--
--   subscription_plans        — catalog of Starter / Standard / Pro / Shop.
--   provider_subscriptions    — one row per Stripe subscription. Includes
--                               §2.4a trial fields (trial_started_at,
--                               converted_at, converting_bid_id).
--   credit_exhausted_events   — Pro/Shop release-trigger instrumentation.
--   commission_overrides      — per-referrer rate/window overrides
--                               (Chris seeded 0.90 perpetual).
--   commission_ledger         — one row per pack/plan commission accrual.
--                               Replaces the founder_commissions write path
--                               once Phase 2's accrueCommission() ships.
--
-- Plus:
--   • UNIQUE index on founder_referrals(founder_id, referred_user_id) so the
--     _processProviderCode + register_provider_referral race can't produce
--     duplicate rows for the same referred provider. Both write paths will
--     be updated (in a later commit on this branch) to use ON CONFLICT DO
--     NOTHING and to standardize on profiles.referred_by_founder_id =
--     member_founder_profiles.id.
--   • AFTER INSERT/UPDATE trigger on commission_ledger that recomputes
--     member_founder_profiles.total_commissions_earned as a trigger-maintained
--     cache — same pattern as profiles.bid_credits from Phase 1.
--
-- Additive and inert until code writes to these tables. Safe to apply.
-- ============================================================================


-- ---- 1. subscription_plans ----------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  plan_key             text PRIMARY KEY
                         CHECK (plan_key IN ('starter','standard','pro','shop')),
  name                 text NOT NULL,
  credits_per_month    integer NOT NULL CHECK (credits_per_month > 0),
  monthly_price_cents  integer NOT NULL CHECK (monthly_price_cents > 0),
  annual_price_cents   integer CHECK (annual_price_cents IS NULL OR annual_price_cents > 0),
  stripe_price_monthly text,
  stripe_price_annual  text,
  is_active            boolean NOT NULL DEFAULT true,
  sort_order           integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_plans IS
  'Catalog of provider subscription plans. Stripe price IDs are filled in by '
  'a one-shot admin bootstrap endpoint per environment (test-mode on drafts, '
  'live-mode after merge). See docs/specs/provider-subscriptions-build-spec.md §2.2.';

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active subscription plans" ON public.subscription_plans;
CREATE POLICY "Anyone can view active subscription plans"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active IS NOT FALSE);

DROP POLICY IF EXISTS "Admins can view all subscription plans" ON public.subscription_plans;
CREATE POLICY "Admins can view all subscription plans"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Seed the four plans. Pro/Shop start inactive (held per spec §2.6 — release
-- when credit_exhausted_events + plan_interest signal demand). Prices come
-- from the spec top matter (Starter $89, Standard $199, Pro $399, Shop $699).
-- Annual monthly-equivalent lives in stripe_price_annual after Phase 3.
INSERT INTO public.subscription_plans
  (plan_key, name, credits_per_month, monthly_price_cents, is_active, sort_order)
VALUES
  ('starter',  'Starter',  10,  8900, true,  1),
  ('standard', 'Standard', 25, 19900, true,  2),
  ('pro',      'Pro',      50, 39900, false, 3),
  ('shop',     'Shop',    100, 69900, false, 4)
ON CONFLICT (plan_key) DO NOTHING;


-- ---- 2. provider_subscriptions ------------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_key                 text NOT NULL REFERENCES public.subscription_plans(plan_key),
  stripe_subscription_id   text NOT NULL UNIQUE,
  stripe_customer_id       text,
  status                   text NOT NULL,
  billing_interval         text NOT NULL CHECK (billing_interval IN ('month','year')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  canceled_at              timestamptz,
  ended_at                 timestamptz,
  -- Phase 2 §2.4a — "Free until first customer" trial tracking.
  trial_started_at         timestamptz,
  converted_at             timestamptz,
  converting_bid_id        uuid,
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.provider_subscriptions IS
  'One row per Stripe provider-plan subscription. status mirrors Stripe. '
  'trial_started_at is set once per provider ever (enforces one-trial-per-'
  'provider rule from §2.4a); converted_at + converting_bid_id populated '
  'when the first accepted bid ends the trial.';

CREATE INDEX IF NOT EXISTS provider_subscriptions_provider
  ON public.provider_subscriptions (provider_id);
CREATE INDEX IF NOT EXISTS provider_subscriptions_customer
  ON public.provider_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
-- One trial per provider ever. Partial unique — only one row per provider
-- may have trial_started_at set. A rejected checkout with 409 trial_used
-- happens at the app layer; this is the belt-and-suspenders DB guard.
CREATE UNIQUE INDEX IF NOT EXISTS provider_subscriptions_one_trial_per_provider
  ON public.provider_subscriptions (provider_id)
  WHERE trial_started_at IS NOT NULL;

ALTER TABLE public.provider_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can view their own subscriptions" ON public.provider_subscriptions;
CREATE POLICY "Providers can view their own subscriptions"
  ON public.provider_subscriptions
  FOR SELECT
  TO authenticated
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.provider_subscriptions;
CREATE POLICY "Admins can view all subscriptions"
  ON public.provider_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());


-- ---- 3. credit_exhausted_events -----------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_exhausted_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.provider_subscriptions(id) ON DELETE SET NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_exhausted_events IS
  'Provider subscription-lot balance hit zero while their subscription '
  'was active. Instrumentation for the Pro/Shop release trigger from spec §2.6.';

CREATE INDEX IF NOT EXISTS credit_exhausted_events_provider
  ON public.credit_exhausted_events (provider_id, occurred_at DESC);

ALTER TABLE public.credit_exhausted_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all credit exhausted events" ON public.credit_exhausted_events;
CREATE POLICY "Admins can view all credit exhausted events"
  ON public.credit_exhausted_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());


-- ---- 4. commission_overrides --------------------------------------------
--
-- Per-referrer commission-rate/window overrides. referrer_id is profiles.id
-- (equivalent to member_founder_profiles.user_id when the founder exists in
-- that table). Chris seeded here as the only override at launch — the
-- Rossy Mateo row previously listed in docs/CAR_CLUB_COMPLETION_PLAN.md was
-- struck through in Phase 0 (see docs/specs/provider-subscriptions-build-notes.md).

CREATE TABLE IF NOT EXISTS public.commission_overrides (
  referrer_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  rate           numeric NOT NULL CHECK (rate > 0 AND rate <= 1),
  window_months  integer CHECK (window_months IS NULL OR window_months > 0),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commission_overrides IS
  'accrueCommission() reads this table first; falls back to standard 50%/12-mo. '
  'window_months=NULL means perpetual (Chris). Adding a new agreed tier is a '
  'row insert here — commission logic never hard-codes any founder.';

ALTER TABLE public.commission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all commission overrides" ON public.commission_overrides;
CREATE POLICY "Admins can view all commission overrides"
  ON public.commission_overrides
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Chris Agrapidis (profiles.id = member_founder_profiles.user_id).
INSERT INTO public.commission_overrides (referrer_id, rate, window_months, note)
VALUES (
  'dbb15523-2441-4ad9-8d2d-c6d8812c7ca2',
  0.90,
  NULL,
  'Chris Agrapidis — founding provider partner (perpetual, no window). Seeded 2026-09-19 with Phase 2.'
)
ON CONFLICT (referrer_id) DO NOTHING;


-- ---- 5. commission_ledger -----------------------------------------------

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id             bigserial PRIMARY KEY,
  referrer_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invoice_id     text NOT NULL,
  product_type   text NOT NULL CHECK (product_type IN ('pack','plan')),
  gross_amount   numeric NOT NULL,
  rate           numeric NOT NULL CHECK (rate > 0 AND rate <= 1),
  amount         numeric NOT NULL,
  earned_on      timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'payable'
                   CHECK (status IN ('pending','payable','paid','voided')),
  refund_of      bigint REFERENCES public.commission_ledger(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commission_ledger IS
  'One row per commission accrual (pack or plan). Annual plans insert 12 '
  'future-dated rows at purchase (spec §3). Refunds insert reversal rows '
  'with refund_of pointing at the original — never mutates the original.';

CREATE INDEX IF NOT EXISTS commission_ledger_referrer
  ON public.commission_ledger (referrer_id, earned_on DESC);
CREATE INDEX IF NOT EXISTS commission_ledger_invoice
  ON public.commission_ledger (invoice_id);
CREATE INDEX IF NOT EXISTS commission_ledger_provider
  ON public.commission_ledger (provider_id);

ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Referrers can view their own commission ledger" ON public.commission_ledger;
CREATE POLICY "Referrers can view their own commission ledger"
  ON public.commission_ledger
  FOR SELECT
  TO authenticated
  USING (referrer_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all commission ledger rows" ON public.commission_ledger;
CREATE POLICY "Admins can view all commission ledger rows"
  ON public.commission_ledger
  FOR SELECT
  TO authenticated
  USING (public.is_admin());


-- ---- 6. Cache trigger — commission_ledger → member_founder_profiles -----

-- Same pattern as Phase 1's profiles.bid_credits cache trigger. SECURITY
-- DEFINER (owner postgres) so any UPDATE on member_founder_profiles from
-- inside this trigger runs with current_user='postgres' — bypassing any
-- future column-guard trigger on that table (there isn't one today).
CREATE OR REPLACE FUNCTION public.commission_ledger_refresh_founder_cache()
RETURNS trigger AS $$
DECLARE
  v_referrer_id uuid;
  v_total       numeric;
BEGIN
  v_referrer_id := COALESCE(NEW.referrer_id, OLD.referrer_id);
  IF v_referrer_id IS NULL THEN RETURN NEW; END IF;

  -- Sum only payable+paid rows; reversals are voided so they net to zero.
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total
    FROM public.commission_ledger
   WHERE referrer_id = v_referrer_id
     AND status IN ('payable', 'paid');

  UPDATE public.member_founder_profiles
     SET total_commissions_earned = v_total,
         updated_at               = now()
   WHERE user_id = v_referrer_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_commission_ledger_refresh_founder_cache
  ON public.commission_ledger;
CREATE TRIGGER trg_commission_ledger_refresh_founder_cache
  AFTER INSERT OR UPDATE ON public.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION public.commission_ledger_refresh_founder_cache();


-- ---- 7. founder_referrals uniqueness ------------------------------------
--
-- Both register_provider_referral (called from signup) and _processProviderCode
-- (called from /api/provider-referral/process post-finalize) currently insert
-- a founder_referrals row when a provider with ?ref=CHRIS signs up. Zero live
-- data today; adding a UNIQUE constraint now prevents the duplicate row
-- pattern from ever manifesting. The code-side fix (skip via ON CONFLICT DO
-- NOTHING on both paths, plus standardize on member_founder_profiles.id for
-- profiles.referred_by_founder_id) lands in a later commit on this branch.

CREATE UNIQUE INDEX IF NOT EXISTS founder_referrals_founder_provider_unique
  ON public.founder_referrals (founder_id, referred_user_id);
