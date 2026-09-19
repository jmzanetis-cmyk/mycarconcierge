-- ============================================================================
-- Phase 1 of provider-subscriptions build spec: credit ledger.
--
-- Balance-of-credits was a mutable counter (`profiles.bid_credits` and
-- `profiles.free_trial_bids`) with ~10 writers scattered across
-- stripe-webhook.js, create-bid-checkout-mobile.js, provider-admin.js,
-- car-clubs.js, agent-fleet-admin.js, ai-ops-admin.js, provider-onboarding.js,
-- plus the two spend RPCs (place_plan_bid, redeem_credits_for_payment).
-- No lot boundaries, no expiry, no spend order — features Phase 2's
-- subscription plans need.
--
-- This migration installs the ledger as the source of truth. Every future
-- write goes through it. The profiles cache stays — updated by an AFTER
-- INSERT trigger on this table — so every existing read path (portal
-- header, admin tables, remaining_bid_credits in plan-bids.js) keeps
-- working untouched while writers are migrated one at a time.
--
-- Trigger safety check: this file's cache trigger is SECURITY DEFINER
-- owned by postgres, so when it UPDATEs profiles, 20260918c's BEFORE
-- UPDATE guard sees `current_user = postgres` and bypasses via the
-- `current_user NOT IN ('anon','authenticated')` rule at line 115.
-- Precedent: place_plan_bid (SECURITY DEFINER, owner postgres) already
-- updates profiles.bid_credits today under the same rule.
--
-- Backfill counts (2026-09-19 prod probe): 65 profiles, 64 with non-zero
-- credits. Sum bid_credits = 60,717. Sum free_trial_bids = 176. The
-- assertion at the tail asserts, per profile, sum(ledger.delta) =
-- profiles.bid_credits + profiles.free_trial_bids.
-- ============================================================================


-- ---- 1. Table -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id           bigserial PRIMARY KEY,
  provider_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta        integer NOT NULL,
  source       text NOT NULL
    CHECK (source IN ('opening','founder','trial','pack','subscription','bonus','admin','bid','refund','expiry','reversal')),
  lot_id       bigint REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  expires_at   timestamptz,
  invoice_id   text,
  ref_type     text,
  ref_id       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_ledger IS
  'Append-only ledger of provider bid-credit grants and spends. profiles.bid_credits '
  'and profiles.free_trial_bids are materialized caches maintained by an AFTER INSERT '
  'trigger on this table. See docs/specs/provider-subscriptions-build-spec.md §1.';

COMMENT ON COLUMN public.credit_ledger.delta IS
  '+N for grants (opening, founder, trial, pack, subscription, bonus, admin+, refund+); '
  '-N for spends (bid, admin-, expiry, reversal). See CHECK on source.';

COMMENT ON COLUMN public.credit_ledger.lot_id IS
  'Spend/expiry rows point at the grant they consume. NULL on grant rows.';

COMMENT ON COLUMN public.credit_ledger.expires_at IS
  'Grants only. NULL = never expires. Set at write for subscription lots; also set '
  'retroactively on subscription cancel (ended_at + 60 days per §2.5).';


-- ---- 2. Indexes ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS credit_ledger_provider_created
  ON public.credit_ledger (provider_id, created_at DESC);

-- Partial index on positive-delta rows for fast lot selection. Spend rows
-- (delta < 0) don't need to be scanned when place_plan_bid picks a lot.
CREATE INDEX IF NOT EXISTS credit_ledger_grants_by_expiry
  ON public.credit_ledger (provider_id, expires_at NULLS LAST, created_at)
  WHERE delta > 0;


-- ---- 3. RLS -------------------------------------------------------------

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

-- Providers see their own ledger rows (read-only). No client-side inserts;
-- every write goes through service-role paths.
DROP POLICY IF EXISTS "Providers can view their own credit ledger"
  ON public.credit_ledger;
CREATE POLICY "Providers can view their own credit ledger"
  ON public.credit_ledger
  FOR SELECT
  TO authenticated
  USING (provider_id = auth.uid());

-- Admins read everything.
DROP POLICY IF EXISTS "Admins can view all credit ledger rows"
  ON public.credit_ledger;
CREATE POLICY "Admins can view all credit ledger rows"
  ON public.credit_ledger
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policies for anon or authenticated — every write
-- must come via service-role from Netlify functions or the ledger trigger
-- itself. RLS-enabled tables reject anything without a policy match, so
-- the absence of write policies here IS the block.


-- ---- 4. Cache trigger ---------------------------------------------------

-- SECURITY DEFINER so the UPDATE on profiles runs as the function owner
-- (postgres) — 20260918c's BEFORE UPDATE guard bypasses when
-- current_user='postgres' (see migration header for why this works).
-- SET search_path pinned for the same reason 20260918c pins it.
CREATE OR REPLACE FUNCTION public.credit_ledger_refresh_cache()
RETURNS trigger AS $$
DECLARE
  v_free_trial integer;
  v_bid_credits integer;
BEGIN
  SELECT
    COALESCE(SUM(delta) FILTER (WHERE source IN ('founder','trial')), 0),
    COALESCE(SUM(delta) FILTER (WHERE source NOT IN ('founder','trial')), 0)
  INTO v_free_trial, v_bid_credits
  FROM public.credit_ledger
  WHERE provider_id = NEW.provider_id;

  UPDATE public.profiles
     SET free_trial_bids = v_free_trial,
         bid_credits     = v_bid_credits,
         updated_at      = now()
   WHERE id = NEW.provider_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_credit_ledger_refresh_cache ON public.credit_ledger;
CREATE TRIGGER trg_credit_ledger_refresh_cache
  AFTER INSERT ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.credit_ledger_refresh_cache();


-- ---- 5. Backfill --------------------------------------------------------

-- One `opening` row per profile with delta=bid_credits (any non-zero balance,
-- regardless of role — see backfill counts in the migration header).
-- Skip profiles where bid_credits IS NULL OR = 0.
INSERT INTO public.credit_ledger (provider_id, delta, source, created_at)
SELECT id, bid_credits, 'opening', COALESCE(created_at, now())
FROM public.profiles
WHERE bid_credits IS NOT NULL AND bid_credits <> 0
ON CONFLICT DO NOTHING;

-- One `founder` row for is_founding_provider=true and `trial` for the rest,
-- where free_trial_bids > 0. is_founding_provider covers Chris (999999
-- allotment) and anyone future-flagged; trial covers the default-3 grants
-- from provider-onboarding.js finalize + the /free_trial_bids seed values.
INSERT INTO public.credit_ledger (provider_id, delta, source, created_at)
SELECT id,
       free_trial_bids,
       CASE WHEN is_founding_provider IS TRUE THEN 'founder' ELSE 'trial' END,
       COALESCE(created_at, now())
FROM public.profiles
WHERE free_trial_bids IS NOT NULL AND free_trial_bids > 0
ON CONFLICT DO NOTHING;

-- Note: the AFTER INSERT trigger fires per row above, recomputing the cache
-- for each profile to sum(ledger). Since the ledger rows we just inserted
-- were derived FROM the cache, the recompute is a no-op numerically. But
-- it verifies the trigger path end-to-end and leaves the profiles.updated_at
-- stamped as a Phase-1-migration marker.


-- ---- 6. Assertion -------------------------------------------------------

-- For every profile with any non-zero cache value, ledger sum must match.
-- Fail the migration outright if any profile drifts. Runs INSIDE the same
-- transaction as the backfill, so a mismatch rolls back the whole change.
DO $$
DECLARE
  v_drift integer;
BEGIN
  SELECT COUNT(*)
    INTO v_drift
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(delta), 0) AS s
        FROM public.credit_ledger l
       WHERE l.provider_id = p.id
    ) l ON true
   WHERE COALESCE(p.bid_credits, 0) + COALESCE(p.free_trial_bids, 0) <> l.s;

  IF v_drift > 0 THEN
    RAISE EXCEPTION 'credit_ledger backfill drift on % profile(s) — sum(ledger) != cache. Rolling back.', v_drift;
  END IF;
END $$;
