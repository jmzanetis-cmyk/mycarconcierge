-- Task #270: Let admins edit, delete, and export transaction history on the
-- Payments page.
--
-- This migration adds:
--   1. `payments.admin_note` column for admin bookkeeping notes.
--   2. A SECURITY DEFINER helper `payments_caller_is_admin()` that returns
--      true for backend/service-role callers (no JWT) and for authenticated
--      users whose `profiles.role = 'admin'`.
--   3. A BEFORE UPDATE trigger that rejects any non-admin write that
--      changes `admin_note` (the brand-new admin-only column added here).
--   4. A BEFORE DELETE trigger that rejects any non-admin delete AND any
--      delete whose payment is referenced by an `open` dispute.
--
-- Why this scope and not full admin-only RLS on UPDATE/DELETE:
--   The payments table is legitimately written to by member and provider
--   flows today (members.js "approve additional work" updates
--   amount_total / amount_mcc_fee; members.js dispute filing writes
--   refund_amount; status transitions held -> released / disputed). Locking
--   those columns to admin-only would break those existing user flows.
--   Follow-up task #271 covers extending these column-scoped triggers to
--   the rest of the admin-only edit fields once the member/provider write
--   paths are refactored to go through admin-issued endpoints.
--
-- Run this in the Supabase Dashboard -> SQL Editor.

-- ============================================================
-- 1. ADMIN NOTE COLUMN
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS admin_note text;

COMMENT ON COLUMN public.payments.admin_note IS
  'Free-text bookkeeping note set by admins via the Payments & Escrow Edit modal. Not shown to members or providers. Writes restricted to admins via trigger.';

-- ============================================================
-- 2. ADMIN/SERVICE-ROLE CALLER HELPER
-- ============================================================
-- Returns true when the caller is the Supabase service role (or any other
-- backend context with no JWT user.id) OR an authenticated user whose
-- profiles.role = 'admin'. Used by triggers below to gate admin-only writes
-- without breaking server-side scripts and Netlify functions.
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
  -- Backend / migration / cron callers don't have a JWT user; treat them
  -- as trusted (server-side code is the source of truth for those flows).
  BEGIN
    uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN true;
  END;

  IF uid IS NULL THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payments_caller_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payments_caller_is_admin() TO authenticated, service_role;

-- ============================================================
-- 3. BLOCK NON-ADMIN WRITES TO admin_note
-- ============================================================
CREATE OR REPLACE FUNCTION public.payments_block_admin_only_column_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.admin_note IS DISTINCT FROM OLD.admin_note
     AND NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION
      'Only admins can edit payment.admin_note'
      USING ERRCODE = 'insufficient_privilege';
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
-- 4. BLOCK NON-ADMIN DELETES + OPEN-DISPUTE DELETES
-- ============================================================
CREATE OR REPLACE FUNCTION public.payments_block_delete_with_open_dispute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Admin / service-role only.
  IF NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION
      'Only admins can delete payments'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Defense-in-depth: never delete a payment that an open dispute points at.
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
