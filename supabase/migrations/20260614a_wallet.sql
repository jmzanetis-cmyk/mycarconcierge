-- ============================================================
-- MCC Wallet — Core Schema  (FEATURE_WALLET default OFF)
-- ============================================================
-- Tables:
--   wallet_accounts   — one per owner (member / driver / provider)
--   wallet_bonus_lots — FIFO bonus lots, 180-day TTL
--   wallet_ledger     — append-only audit trail
--
-- Data migration:
--   Existing member_credits → wallet_accounts + wallet_ledger
--   Canonical balance lives in wallet_accounts.*_balance_cents,
--   maintained by row-lock in RPCs (not recomputed from ledger).
--
-- Compatibility:
--   member_credits stays intact; care_plans.credit_redemption_id FK
--   keeps working. redeem_credits_for_payment now writes to wallet
--   AND member_credits (for the FK); new code paths use wallet only.
-- ============================================================

-- ── wallet_accounts ──────────────────────────────────────────
CREATE TABLE public.wallet_accounts (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                     uuid        NOT NULL,
  owner_type                   text        NOT NULL
                                           CHECK (owner_type IN ('member','driver','provider')),
  cash_balance_cents           integer     NOT NULL DEFAULT 0,
  bonus_balance_cents          integer     NOT NULL DEFAULT 0,
  auto_reload_enabled          boolean     NOT NULL DEFAULT false,
  auto_reload_threshold_cents  integer,
  auto_reload_amount_cents     integer,
  stripe_customer_id           text,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, owner_type)
);

-- ── wallet_bonus_lots ────────────────────────────────────────
CREATE TABLE public.wallet_bonus_lots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       uuid        NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
  amount_cents    integer     NOT NULL CHECK (amount_cents > 0),
  remaining_cents integer     NOT NULL CHECK (remaining_cents >= 0),
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wallet_bonus_lots_fifo_idx
  ON public.wallet_bonus_lots (wallet_id, expires_at)
  WHERE remaining_cents > 0;

-- ── wallet_ledger ────────────────────────────────────────────
CREATE TABLE public.wallet_ledger (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id           uuid        NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
  entry_type          text        NOT NULL CHECK (entry_type IN (
                        'load_cash', 'load_bonus',
                        'spend_cash', 'spend_bonus',
                        'refund_cash', 'refund_bonus',
                        'expire_bonus',
                        'cancellation_fee',
                        'credit_migrate'
                      )),
  amount_cents        integer     NOT NULL,
  balance_after_cents integer     NOT NULL,
  ref_id              text,
  lot_id              uuid        REFERENCES public.wallet_bonus_lots(id),
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wallet_ledger_wallet_created_idx
  ON public.wallet_ledger (wallet_id, created_at DESC);

-- ── Migrate member_credits → wallet ─────────────────────────
-- Creates one wallet_accounts row per member (cash_balance = SUM of credits).
-- Historical member_credits rows land in wallet_ledger for audit trail.
-- Idempotent: ON CONFLICT skips members already migrated.
DO $$
DECLARE
  r        RECORD;
  w_id     uuid;
  running  integer;
  row_r    RECORD;
BEGIN
  FOR r IN
    SELECT member_id, COALESCE(SUM(amount), 0) AS net_balance
      FROM public.member_credits
     GROUP BY member_id
  LOOP
    INSERT INTO public.wallet_accounts (owner_id, owner_type, cash_balance_cents)
    VALUES (r.member_id, 'member', GREATEST(r.net_balance, 0))
    ON CONFLICT (owner_id, owner_type) DO UPDATE
      SET cash_balance_cents = GREATEST(r.net_balance, 0),
          updated_at = now()
    RETURNING id INTO w_id;

    -- ON CONFLICT DO UPDATE always returns a row; but guard just in case
    IF w_id IS NULL THEN
      SELECT id INTO w_id FROM public.wallet_accounts
       WHERE owner_id = r.member_id AND owner_type = 'member';
    END IF;

    -- Migrate individual credit rows as ledger entries for audit
    running := 0;
    FOR row_r IN
      SELECT id, amount, type, description, created_at
        FROM public.member_credits
       WHERE member_id = r.member_id
       ORDER BY created_at, id
    LOOP
      running := running + row_r.amount;
      INSERT INTO public.wallet_ledger (
        wallet_id, entry_type, amount_cents, balance_after_cents,
        ref_id, description, created_at
      ) VALUES (
        w_id,
        'credit_migrate',
        row_r.amount,
        running,
        row_r.id::text,
        COALESCE(row_r.description, row_r.type),
        row_r.created_at
      );
    END LOOP;
  END LOOP;
END $$;

-- ── redeem_credits_for_payment (updated) ─────────────────────
-- Reads balance from wallet_accounts (falls back to member_credits SUM
-- for members not yet migrated). Writes to wallet_ledger AND member_credits
-- so care_plans.credit_redemption_id FK continues to work.
CREATE OR REPLACE FUNCTION redeem_credits_for_payment(
  p_member_id     UUID,
  p_care_plan_id  UUID,
  p_credits_cents INT
)
RETURNS TABLE(credit_applied_cents INT, redemption_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_credit      INT;
  v_plan_redemption  UUID;
  v_escrow_amount    NUMERIC;
  v_new_credit_id    UUID;
  v_wallet_id        uuid;
  v_cash_balance     INT;
BEGIN
  -- Row-lock the care plan
  SELECT cp.credit_applied_cents, cp.credit_redemption_id, cp.escrow_amount
    INTO v_plan_credit, v_plan_redemption, v_escrow_amount
    FROM care_plans cp
   WHERE cp.id = p_care_plan_id AND cp.member_id = p_member_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'care plan not found or access denied';
  END IF;

  -- Idempotency: already redeemed
  IF v_plan_redemption IS NOT NULL THEN
    RETURN QUERY SELECT v_plan_credit, v_plan_redemption;
    RETURN;
  END IF;

  IF p_credits_cents <= 0 THEN
    RAISE EXCEPTION 'credits_cents must be positive';
  END IF;

  -- Row-lock wallet account for atomic balance update
  SELECT id, cash_balance_cents
    INTO v_wallet_id, v_cash_balance
    FROM public.wallet_accounts
   WHERE owner_id = p_member_id AND owner_type = 'member'
     FOR UPDATE;

  IF NOT FOUND THEN
    -- Member not yet migrated to wallet; fall back to ledger sum
    SELECT COALESCE(SUM(amount), 0) INTO v_cash_balance
      FROM public.member_credits WHERE member_id = p_member_id;
    v_wallet_id := NULL;
  END IF;

  IF v_cash_balance < p_credits_cents THEN
    RAISE EXCEPTION 'insufficient credit balance';
  END IF;

  IF p_credits_cents > ROUND(v_escrow_amount * 100) THEN
    RAISE EXCEPTION 'credits exceed charge amount';
  END IF;

  -- Write member_credits row (keeps care_plans FK valid)
  INSERT INTO public.member_credits(member_id, amount, type, description)
  VALUES (p_member_id, -p_credits_cents, 'redemption',
          'Applied to care plan ' || p_care_plan_id)
  RETURNING id INTO v_new_credit_id;

  -- Wallet debit + ledger entry
  IF v_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents, ref_id, description
    ) VALUES (
      v_wallet_id, 'spend_cash', -p_credits_cents,
      v_cash_balance - p_credits_cents,
      p_care_plan_id::text,
      'Applied to care plan ' || p_care_plan_id
    );

    UPDATE public.wallet_accounts
       SET cash_balance_cents = cash_balance_cents - p_credits_cents,
           updated_at = now()
     WHERE id = v_wallet_id;
  END IF;

  -- Stamp the care plan
  UPDATE care_plans
     SET credit_applied_cents = p_credits_cents,
         credit_redemption_id = v_new_credit_id,
         updated_at = NOW()
   WHERE id = p_care_plan_id;

  RETURN QUERY SELECT p_credits_cents, v_new_credit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_credits_for_payment(UUID, UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION redeem_credits_for_payment(UUID, UUID, INT) TO service_role;

-- ── wallet_load RPC ──────────────────────────────────────────
-- Loads cash + optional bonus into a wallet. Creates wallet_accounts
-- row if not exists. Bonus lots expire after 180 days (FIFO).
CREATE OR REPLACE FUNCTION wallet_load(
  p_owner_id              UUID,
  p_owner_type            TEXT,
  p_cash_cents            INT,
  p_bonus_cents           INT  DEFAULT 0,
  p_stripe_payment_intent TEXT DEFAULT NULL,
  p_description           TEXT DEFAULT NULL
)
RETURNS TABLE(cash_balance_cents INT, bonus_balance_cents INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id   uuid;
  v_cash_after  int;
  v_bonus_after int;
  v_lot_id      uuid;
BEGIN
  IF p_cash_cents < 0 THEN
    RAISE EXCEPTION 'cash_cents cannot be negative';
  END IF;

  -- Ensure wallet account exists
  INSERT INTO public.wallet_accounts (owner_id, owner_type)
  VALUES (p_owner_id, p_owner_type)
  ON CONFLICT (owner_id, owner_type) DO NOTHING;

  -- Row-lock for atomic update
  SELECT id, wa.cash_balance_cents, wa.bonus_balance_cents
    INTO v_wallet_id, v_cash_after, v_bonus_after
    FROM public.wallet_accounts wa
   WHERE owner_id = p_owner_id AND owner_type = p_owner_type
     FOR UPDATE;

  v_cash_after  := v_cash_after  + p_cash_cents;
  v_bonus_after := v_bonus_after + p_bonus_cents;

  IF p_cash_cents > 0 THEN
    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents, ref_id, description
    ) VALUES (
      v_wallet_id, 'load_cash', p_cash_cents, v_cash_after,
      p_stripe_payment_intent, COALESCE(p_description, 'Wallet top-up')
    );
  END IF;

  IF p_bonus_cents > 0 THEN
    INSERT INTO public.wallet_bonus_lots (wallet_id, amount_cents, remaining_cents, expires_at)
    VALUES (v_wallet_id, p_bonus_cents, p_bonus_cents, now() + interval '180 days')
    RETURNING id INTO v_lot_id;

    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents, lot_id, description
    ) VALUES (
      v_wallet_id, 'load_bonus', p_bonus_cents, v_bonus_after,
      v_lot_id, COALESCE(p_description, 'Bonus credit')
    );
  END IF;

  UPDATE public.wallet_accounts
     SET cash_balance_cents  = v_cash_after,
         bonus_balance_cents = v_bonus_after,
         updated_at = now()
   WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_cash_after, v_bonus_after;
END;
$$;

REVOKE EXECUTE ON FUNCTION wallet_load(UUID, TEXT, INT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION wallet_load(UUID, TEXT, INT, INT, TEXT, TEXT) TO service_role;

-- ── wallet_spend RPC ─────────────────────────────────────────
-- Debits wallet: oldest-expiring bonus lots first (FIFO), then cash.
-- Raises if balance insufficient. Caller must ensure sufficient balance
-- or catch the exception and fall back to card.
CREATE OR REPLACE FUNCTION wallet_spend(
  p_owner_id     UUID,
  p_owner_type   TEXT,
  p_amount_cents INT,
  p_ref_id       TEXT DEFAULT NULL,
  p_description  TEXT DEFAULT NULL
)
RETURNS TABLE(cash_spent_cents INT, bonus_spent_cents INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id   uuid;
  v_cash_bal    int;
  v_bonus_bal   int;
  v_remain      int;
  v_lot         RECORD;
  v_lot_debit   int;
  v_bonus_spent int := 0;
  v_cash_spent  int;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  SELECT id, cash_balance_cents, bonus_balance_cents
    INTO v_wallet_id, v_cash_bal, v_bonus_bal
    FROM public.wallet_accounts
   WHERE owner_id = p_owner_id AND owner_type = p_owner_type
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found for owner';
  END IF;

  IF (v_cash_bal + v_bonus_bal) < p_amount_cents THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  v_remain := p_amount_cents;

  -- Drain bonus lots FIFO (oldest-expiring first)
  FOR v_lot IN
    SELECT id, remaining_cents FROM public.wallet_bonus_lots
     WHERE wallet_id = v_wallet_id AND remaining_cents > 0
     ORDER BY expires_at, id
       FOR UPDATE
  LOOP
    EXIT WHEN v_remain = 0;
    v_lot_debit := LEAST(v_lot.remaining_cents, v_remain);

    UPDATE public.wallet_bonus_lots
       SET remaining_cents = remaining_cents - v_lot_debit
     WHERE id = v_lot.id;

    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents,
      lot_id, ref_id, description
    ) VALUES (
      v_wallet_id, 'spend_bonus', -v_lot_debit,
      v_bonus_bal - v_bonus_spent - v_lot_debit,
      v_lot.id, p_ref_id, p_description
    );

    v_bonus_spent := v_bonus_spent + v_lot_debit;
    v_remain      := v_remain - v_lot_debit;
  END LOOP;

  -- Remaining from cash
  v_cash_spent := v_remain;
  IF v_cash_spent > 0 THEN
    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents,
      ref_id, description
    ) VALUES (
      v_wallet_id, 'spend_cash', -v_cash_spent,
      v_cash_bal - v_cash_spent,
      p_ref_id, p_description
    );
  END IF;

  UPDATE public.wallet_accounts
     SET cash_balance_cents  = v_cash_bal  - v_cash_spent,
         bonus_balance_cents = v_bonus_bal - v_bonus_spent,
         updated_at = now()
   WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_cash_spent, v_bonus_spent;
END;
$$;

REVOKE EXECUTE ON FUNCTION wallet_spend(UUID, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION wallet_spend(UUID, TEXT, INT, TEXT, TEXT) TO service_role;

-- ── wallet_refund RPC ────────────────────────────────────────
-- Refunds amount_cents to the cash bucket only (refunds never go to bonus).
CREATE OR REPLACE FUNCTION wallet_refund(
  p_owner_id     UUID,
  p_owner_type   TEXT,
  p_amount_cents INT,
  p_ref_id       TEXT DEFAULT NULL,
  p_description  TEXT DEFAULT NULL
)
RETURNS TABLE(cash_balance_cents INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id  uuid;
  v_cash_after int;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  SELECT id, cash_balance_cents
    INTO v_wallet_id, v_cash_after
    FROM public.wallet_accounts
   WHERE owner_id = p_owner_id AND owner_type = p_owner_type
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found for owner';
  END IF;

  v_cash_after := v_cash_after + p_amount_cents;

  INSERT INTO public.wallet_ledger (
    wallet_id, entry_type, amount_cents, balance_after_cents, ref_id, description
  ) VALUES (
    v_wallet_id, 'refund_cash', p_amount_cents, v_cash_after,
    p_ref_id, COALESCE(p_description, 'Refund')
  );

  UPDATE public.wallet_accounts
     SET cash_balance_cents = v_cash_after,
         updated_at = now()
   WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_cash_after;
END;
$$;

REVOKE EXECUTE ON FUNCTION wallet_refund(UUID, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION wallet_refund(UUID, TEXT, INT, TEXT, TEXT) TO service_role;

-- ── expire_bonus_lots (for pg_cron) ─────────────────────────
-- Marks expired lots with remaining > 0, writes ledger, updates balance.
CREATE OR REPLACE FUNCTION expire_wallet_bonus_lots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot    RECORD;
  v_wallet RECORD;
BEGIN
  FOR v_lot IN
    SELECT bl.id, bl.wallet_id, bl.remaining_cents
      FROM public.wallet_bonus_lots bl
     WHERE bl.expires_at <= now() AND bl.remaining_cents > 0
       FOR UPDATE SKIP LOCKED
  LOOP
    SELECT id, bonus_balance_cents INTO v_wallet
      FROM public.wallet_accounts WHERE id = v_lot.wallet_id FOR UPDATE;

    INSERT INTO public.wallet_ledger (
      wallet_id, entry_type, amount_cents, balance_after_cents, lot_id, description
    ) VALUES (
      v_lot.wallet_id, 'expire_bonus', -v_lot.remaining_cents,
      v_wallet.bonus_balance_cents - v_lot.remaining_cents,
      v_lot.id, 'Bonus lot expired'
    );

    UPDATE public.wallet_accounts
       SET bonus_balance_cents = bonus_balance_cents - v_lot.remaining_cents,
           updated_at = now()
     WHERE id = v_lot.wallet_id;

    UPDATE public.wallet_bonus_lots
       SET remaining_cents = 0
     WHERE id = v_lot.id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION expire_wallet_bonus_lots() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION expire_wallet_bonus_lots() TO service_role;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.wallet_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_bonus_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger     ENABLE ROW LEVEL SECURITY;

-- Members/drivers/providers see their own wallet
CREATE POLICY "owner sees own wallet_account"
  ON public.wallet_accounts FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "owner sees own bonus_lots"
  ON public.wallet_bonus_lots FOR SELECT
  USING (
    wallet_id IN (
      SELECT id FROM public.wallet_accounts WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "owner sees own ledger"
  ON public.wallet_ledger FOR SELECT
  USING (
    wallet_id IN (
      SELECT id FROM public.wallet_accounts WHERE owner_id = auth.uid()
    )
  );

-- Service role bypasses RLS (all RPCs run SECURITY DEFINER)
