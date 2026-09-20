-- ============================================================================
-- 20260920a_stripe_mode_aware_plan_ids.sql
--
-- subscription_plans stored a single stripe_price_monthly column, but the same
-- database is served by both draft (sk_test) and production (sk_live) Netlify
-- functions. When the sandbox bootstrap ran, it wrote TEST price ids into the
-- shared column. A subsequent bootstrap invocation on production would see
-- stripe_price_monthly IS NOT NULL and skip creation, leaving the DB with a
-- test-mode price id that plan-checkout would then hand to LIVE Stripe —
-- guaranteed 400 no_such_price on the very first Start-trial click in prod.
--
-- This migration makes the id storage mode-aware:
--
--   stripe_product_id           TEXT NULL  -- LIVE product id (canonical)
--   stripe_price_monthly        TEXT NULL  -- LIVE monthly price id
--   stripe_product_id_test      TEXT NULL  -- TEST product id
--   stripe_price_monthly_test   TEXT NULL  -- TEST monthly price id
--
-- The bootstrap endpoint chooses the column pair by inspecting its own key
-- prefix (sk_live_ vs sk_test_) and only writes/reads the pair for its mode.
-- The existing test ids currently sitting in stripe_price_monthly are moved
-- into stripe_price_monthly_test so the draft continues to work unchanged.
--
-- Additive migration; no writes are lost. Safe to re-run (guards on ADD
-- COLUMN IF NOT EXISTS and a WHERE clause on the UPDATE).
-- ============================================================================

BEGIN;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_product_id         TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_product_id_test    TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_price_monthly_test TEXT NULL;

COMMENT ON COLUMN public.subscription_plans.stripe_product_id
  IS 'Stripe live-mode Product id — populated by admin-provider-plans-bootstrap when running with sk_live_.';
COMMENT ON COLUMN public.subscription_plans.stripe_product_id_test
  IS 'Stripe test-mode Product id — populated by admin-provider-plans-bootstrap when running with sk_test_.';
COMMENT ON COLUMN public.subscription_plans.stripe_price_monthly
  IS 'Stripe live-mode monthly Price id.';
COMMENT ON COLUMN public.subscription_plans.stripe_price_monthly_test
  IS 'Stripe test-mode monthly Price id.';

-- Relocate the sandbox bootstrap output. The only rows with a non-null
-- stripe_price_monthly today were written by the sk_test_ bootstrap during
-- Phase 2 verification (see PR #17). Anything that lands here has been a
-- test id.
UPDATE public.subscription_plans
   SET stripe_price_monthly_test = stripe_price_monthly,
       stripe_price_monthly      = NULL
 WHERE stripe_price_monthly IS NOT NULL;

COMMIT;
