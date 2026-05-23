-- Task #271 — Column-level guard on admin-only payment fields.
--
-- Adds a BEFORE UPDATE trigger that raises if any of:
--   admin_note, amount_total, amount_mcc_fee, refund_amount
-- is changed by a caller that is not the service_role, a trusted postgres
-- role, or an authenticated admin.
--
-- This is a defence-in-depth companion to the broader
-- payments_enforce_admin_only_writes trigger (Task #270 / 20260429). If
-- that guard is ever relaxed to allow certain member direct writes, this
-- trigger ensures the four sensitive financial/bookkeeping columns remain
-- admin-only regardless.
--
-- Sanctioned member RPCs (member_approve_additional_work, etc.) are
-- SECURITY DEFINER owned by postgres, so current_user = 'postgres' at
-- execution time — both triggers let them through.
--
-- OPERATOR NOTE: run in Supabase Dashboard → SQL Editor, or via
--   supabase db push  (if using the local CLI workflow).

-- ============================================================
-- 1. COLUMN-LEVEL GUARD FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.payments_guard_admin_only_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Trusted roles (postgres, supabase_admin, service_role) bypass — every
  -- SECURITY DEFINER RPC and pg_cron job runs under one of these identities.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  -- Authenticated admins may change any column.
  IF public.payments_caller_is_admin() THEN
    RETURN NEW;
  END IF;

  -- Reject if any protected column is being changed.
  IF (OLD.admin_note     IS DISTINCT FROM NEW.admin_note)     OR
     (OLD.amount_total   IS DISTINCT FROM NEW.amount_total)   OR
     (OLD.amount_mcc_fee IS DISTINCT FROM NEW.amount_mcc_fee) OR
     (OLD.refund_amount  IS DISTINCT FROM NEW.refund_amount)  THEN
    RAISE EXCEPTION
      'Columns admin_note, amount_total, amount_mcc_fee, and refund_amount are admin-only and cannot be modified directly. Admins must use admin_edit_payment(); members must use the sanctioned RPCs.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. ATTACH TRIGGER
-- ============================================================
DROP TRIGGER IF EXISTS payments_admin_only_columns ON public.payments;
CREATE TRIGGER payments_admin_only_columns
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_guard_admin_only_columns();
