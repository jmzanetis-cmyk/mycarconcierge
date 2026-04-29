-- Task #270: Let admins edit, delete, and export transaction history on the
-- Payments page.
--
-- This migration:
--   1. Adds the `payments.admin_note` bookkeeping column.
--   2. Installs `payments_caller_is_admin()` — a SECURITY DEFINER helper
--      that returns true only for the Supabase service role
--      (auth.role()='service_role') OR an authenticated user whose
--      `profiles.role = 'admin'`. Anonymous, unauthenticated, non-admin
--      and direct-PG sessions all return false.
--   3. Installs two SECURITY DEFINER RPCs — `admin_edit_payment()` and
--      `admin_delete_payment()` — that the admin Edit / Delete UI calls
--      via `supabaseClient.rpc()`. Both check `payments_caller_is_admin()`
--      first, so non-admin authenticated callers are rejected at the
--      database.
--   4. Installs a BEFORE UPDATE trigger
--      (`payments_enforce_admin_only_writes`) that whitelists only the
--      four sanctioned non-admin member transitions and rejects every
--      other field-level edit. This satisfies the task requirement that
--      "non-admins cannot edit payments via the Supabase client" while
--      keeping the existing browser-side member flows working.
--   5. Installs a BEFORE DELETE trigger that rejects non-admin deletes
--      AND deletes whose payment is referenced by an `open` dispute.
--
-- Sanctioned non-admin transitions (caller must be the package owner):
--   A. Approve additional work — amount_total / amount_provider /
--      amount_mcc_fee may change; status / refund_amount unchanged.
--      (members.js, members-packages.js, members-core.js upsell flows.)
--   B. Release on completion — status held -> released; amount and
--      refund unchanged. released_at may also be set.
--   C. File dispute — status -> disputed; amount and refund unchanged.
--   D. Provider unable to start (refund) — status held -> refunded with
--      refund_amount populated; amount unchanged.
--
-- Pattern mirrors restrict_profile_suspension_writes() in
-- 20260428e_provider_writes_rls_lockdown.sql, which uses auth.role() to
-- detect service_role JWTs from Netlify functions.
--
-- OPERATOR NOTE: direct-PG sessions (Supabase SQL Editor, psql with
-- postgres role, pg_cron) have auth.role()=NULL and auth.uid()=NULL, so
-- the helper returns FALSE for them. To repair data manually, either
-- (a) call the RPCs under an admin JWT, or (b) temporarily disable the
-- triggers below.
--
-- Run this in the Supabase Dashboard -> SQL Editor.

-- ============================================================
-- 1. ADMIN NOTE COLUMN
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS admin_note text;

COMMENT ON COLUMN public.payments.admin_note IS
  'Free-text bookkeeping note set by admins via the Payments & Escrow Edit modal. Not shown to members or providers. Writes restricted to admins via trigger and RPC.';

-- ============================================================
-- 2. ADMIN / SERVICE-ROLE CALLER HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION public.payments_caller_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payments_caller_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payments_caller_is_admin() TO authenticated, service_role;

-- ============================================================
-- 3. ADMIN-ONLY EDIT RPC
-- ============================================================
-- Called from admin.html via supabaseClient.rpc('admin_edit_payment', ...).
CREATE OR REPLACE FUNCTION public.admin_edit_payment(
  p_id uuid,
  p_status text,
  p_amount_total numeric,
  p_amount_mcc_fee numeric,
  p_refund_amount numeric,
  p_admin_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can edit payments'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.payments
     SET status         = p_status,
         amount_total   = p_amount_total,
         amount_mcc_fee = p_amount_mcc_fee,
         refund_amount  = p_refund_amount,
         admin_note     = p_admin_note
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_edit_payment(uuid, text, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_edit_payment(uuid, text, numeric, numeric, numeric, text) TO authenticated;

-- ============================================================
-- 4. ADMIN-ONLY DELETE RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_payment(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete payments'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.disputes
    WHERE payment_id = p_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION
      'Cannot delete payment %: an open dispute references it. Resolve the dispute first.',
      p_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  DELETE FROM public.payments WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_payment(uuid) TO authenticated;

-- ============================================================
-- 5. ENFORCE ADMIN-ONLY WRITES (whitelist member transitions)
-- ============================================================
-- Single BEFORE UPDATE trigger that:
--   - lets service-role and admin writes through
--   - lets the package owner perform exactly the four sanctioned member
--     transitions (A-D documented above)
--   - rejects every other non-admin update (including any change to
--     admin_note, refund_reason on its own, or arbitrary field edits).
-- This means non-admin authenticated users that try to edit a payment
-- via the Supabase JS client outside the sanctioned flows are rejected
-- at the database — closing the original Task #270 attack surface.
CREATE OR REPLACE FUNCTION public.payments_enforce_admin_only_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  uid              uuid := auth.uid();
  is_owner         boolean;
  status_changed   boolean;
  refund_changed   boolean;
  amount_changed   boolean;
  admin_note_changed boolean;
BEGIN
  -- Admins / service-role: pass through.
  IF public.payments_caller_is_admin() THEN
    RETURN NEW;
  END IF;

  admin_note_changed := NEW.admin_note IS DISTINCT FROM OLD.admin_note;
  IF admin_note_changed THEN
    RAISE EXCEPTION 'Only admins can edit payment.admin_note'
      USING ERRCODE = '42501';
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Anonymous callers cannot modify payments'
      USING ERRCODE = '42501';
  END IF;

  -- Non-admin caller must own the package this payment is attached to.
  is_owner := EXISTS (
    SELECT 1 FROM public.maintenance_packages
    WHERE id = NEW.package_id AND member_id = uid
  );
  IF NOT is_owner THEN
    RAISE EXCEPTION 'Only admins or the package owner can modify payment %', OLD.id
      USING ERRCODE = '42501';
  END IF;

  status_changed := NEW.status IS DISTINCT FROM OLD.status;
  refund_changed := NEW.refund_amount IS DISTINCT FROM OLD.refund_amount;
  amount_changed := (NEW.amount_total   IS DISTINCT FROM OLD.amount_total)
                 OR (NEW.amount_provider IS DISTINCT FROM OLD.amount_provider)
                 OR (NEW.amount_mcc_fee  IS DISTINCT FROM OLD.amount_mcc_fee);

  -- Pattern A: approve additional work (amount fields only).
  IF amount_changed AND NOT status_changed AND NOT refund_changed THEN
    RETURN NEW;
  END IF;

  -- Pattern B: release on completion (held -> released).
  IF NEW.status = 'released' AND OLD.status = 'held'
     AND NOT amount_changed AND NOT refund_changed THEN
    RETURN NEW;
  END IF;

  -- Pattern C: file dispute (-> disputed, status flag only).
  IF NEW.status = 'disputed'
     AND NOT amount_changed AND NOT refund_changed THEN
    RETURN NEW;
  END IF;

  -- Pattern D: provider unable to start (held -> refunded with refund_amount).
  IF NEW.status = 'refunded' AND OLD.status = 'held'
     AND refund_changed AND NOT amount_changed THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Non-admin payment update for % does not match an approved member transition (status: % -> %, amount changed: %, refund changed: %). Use the admin Edit modal or fix the call site.',
    OLD.id, COALESCE(OLD.status, 'NULL'), COALESCE(NEW.status, 'NULL'),
    amount_changed, refund_changed
    USING ERRCODE = '42501';
END;
$$;

-- Replace the previous narrower trigger with the comprehensive one.
DROP TRIGGER IF EXISTS payments_admin_only_columns ON public.payments;
DROP TRIGGER IF EXISTS payments_enforce_admin_only_writes ON public.payments;
CREATE TRIGGER payments_enforce_admin_only_writes
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_enforce_admin_only_writes();

-- ============================================================
-- 6. BLOCK NON-ADMIN DELETES AND OPEN-DISPUTE DELETES
-- ============================================================
CREATE OR REPLACE FUNCTION public.payments_block_delete_with_open_dispute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete payments'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.disputes d
    WHERE d.payment_id = OLD.id
      AND d.status = 'open'
  ) THEN
    RAISE EXCEPTION
      'Cannot delete payment %: an open dispute references it. Resolve the dispute first.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS payments_block_delete_open_dispute ON public.payments;
CREATE TRIGGER payments_block_delete_open_dispute
  BEFORE DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_block_delete_with_open_dispute();
