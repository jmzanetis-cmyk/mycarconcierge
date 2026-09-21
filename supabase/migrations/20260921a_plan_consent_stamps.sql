-- ============================================================================
-- 20260921a_plan_consent_stamps.sql
--
-- Section A of the provider-plan disclosure work — records affirmative consent
-- at Stripe Checkout. On checkout.session.completed (provider_plan only) the
-- webhook reads session.consent.terms_of_service === 'accepted' and stamps
-- these three columns. Non-provider_plan checkouts never touch them.
--
-- Columns are NEVER deleted on cancellation — regulators can require years-later
-- proof of the original consent, and stashing it on the subscription row keeps
-- it queryable without cross-joining to Stripe.
-- ============================================================================

BEGIN;

ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS terms_accepted_at   TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS terms_version       TEXT NULL,
  ADD COLUMN IF NOT EXISTS checkout_session_id TEXT NULL;

COMMENT ON COLUMN public.provider_subscriptions.terms_accepted_at
  IS 'Timestamp of session.consent.terms_of_service=accepted at Stripe Checkout. Never cleared on cancellation — retained as proof.';
COMMENT ON COLUMN public.provider_subscriptions.terms_version
  IS 'The MCC Terms of Service version the provider clicked accept on. Bumped when terms.html §7 changes.';
COMMENT ON COLUMN public.provider_subscriptions.checkout_session_id
  IS 'Stripe cs_ id from the Checkout Session that captured consent. Cross-reference with Stripe dashboard.';

COMMIT;
