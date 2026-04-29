-- Task #270: Let admins edit, delete, and export transaction history on the
-- Payments page.
--
-- This migration:
--   1. Adds the `payments.admin_note` bookkeeping column.
--   2. Installs `payments_caller_is_admin()` — a SECURITY DEFINER helper
--      that returns true only for the Supabase service role (Netlify
--      functions / server-side scripts using SUPABASE_SERVICE_ROLE_KEY) or
--      for an authenticated user whose `profiles.role = 'admin'`. Anonymous
--      / unauthenticated / non-admin callers and direct-PG sessions
--      (psql, SQL Editor, pg_cron) all return false.
--   3. Installs two SECURITY DEFINER RPCs — `admin_edit_payment()` and
--      `admin_delete_payment()` — that the admin Edit / Delete UI calls
--      via supabaseClient.rpc(). Both check `payments_caller_is_admin()`
--      first, so non-admin authenticated users that try to invoke them
--      directly via the Supabase JS client are rejected at the database.
--   4. Adds a BEFORE UPDATE trigger that, as defense-in-depth, blocks any
--      non-admin write that changes `admin_note` even if it bypasses the
--      RPC.
--   5. Adds a BEFORE DELETE trigger that blocks non-admin deletes AND
--      blocks deletes whose payment is referenced by an `open` dispute.
--
-- Why we route admin edit through an RPC instead of locking every editable
-- payment column at the table level: members.js / members-packages.js /
-- members-core.js write `amount_total`, `amount_mcc_fee`, `refund_amount`
-- and `status` from the browser today (member "approve additional work"
-- and member dispute filing). Locking those columns table-wide would break
-- those flows. Mirroring the pattern from 20260428e_provider_writes_rls_lockdown.sql,
-- this migration moves only the admin-issued mutations onto a server-side
-- code path. Follow-up #271 covers extending the trigger lock to those
-- remaining columns once the member/provider flows are also moved onto
-- service-role RPCs.
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
-- Positive identification of admin callers. Pattern mirrors
-- restrict_profile_suspension_writes() from
-- 20260428e_provider_writes_rls_lockdown.sql, which uses auth.role() to
-- detect service_role JWTs from Netlify functions.
--
-- OPERATOR NOTE: direct-PG sessions (Supabase SQL Editor, psql with
-- postgres role, pg_cron) have auth.role() = NULL and auth.uid() = NULL,
-- so this helper returns FALSE for them. To repair data manually, either
-- (a) call the RPC under an admin JWT, or (b) temporarily disable the
-- triggers below.
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
-- All 5 editable columns are passed every call (mirroring the modal); pass
-- NULL to clear admin_note.
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
      USING ERRCODE = '42501'; -- insufficient_privilege
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
-- 5. DEFENSE-IN-DEPTH: BLOCK NON-ADMIN WRITES TO admin_note
-- ============================================================
-- Even if a future code path tries `payments.update({ admin_note: ... })`
-- directly, this trigger refuses unless the caller is admin or service_role.
CREATE OR REPLACE FUNCTION public.payments_block_admin_only_column_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.admin_note IS DISTINCT FROM OLD.admin_note
     AND NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can edit payment.admin_note'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_admin_only_columns ON public.payments;
CREATE TRIGGER payments_admin_only_columns
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_block_admin_only_column_writes();

-- ============================================================
-- 6. DEFENSE-IN-DEPTH: BLOCK NON-ADMIN DELETES AND OPEN-DISPUTE DELETES
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
