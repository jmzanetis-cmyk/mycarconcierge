-- Task #425 (Step 6): True idempotency for the Stripe webhook bid-credit
-- grant.
--
-- Background: the prior idempotency check piggybacked on
-- founder_commissions(transaction_id), but that row only exists when the
-- purchasing provider has a referrer. For providers without a referrer,
-- recordBidPackCommission returns { message: 'no_referrer' } and the check
-- fell through, so a Stripe webhook retry could double-credit the bids.
--
-- Fix: dedicated grant log keyed by Stripe transaction id (= the checkout
-- session's payment_intent id). The webhook inserts BEFORE updating
-- profiles.bid_credits; a 23505 unique-violation means the grant was
-- already applied and we skip.

CREATE TABLE IF NOT EXISTS public.bid_credit_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  text NOT NULL UNIQUE,
  provider_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_bids      integer NOT NULL CHECK (total_bids > 0),
  pack_id         text,
  granted_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bid_credit_grants_provider
  ON public.bid_credit_grants (provider_id, granted_at DESC);

ALTER TABLE public.bid_credit_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bid_credit_grants" ON public.bid_credit_grants;
CREATE POLICY "service_role_bid_credit_grants"
  ON public.bid_credit_grants FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "providers_read_own_bid_credit_grants" ON public.bid_credit_grants;
CREATE POLICY "providers_read_own_bid_credit_grants"
  ON public.bid_credit_grants FOR SELECT
  USING (provider_id = auth.uid());
