-- Task #270: Let admins edit, delete, and export transaction history on the
-- Payments page.
--
-- Goal of the security model in this migration:
--   * Direct browser-side `payments` UPDATE / DELETE via the Supabase JS
--     client is rejected at the database for everyone except the Supabase
--     service role (Netlify functions / server.js).
--   * All legitimate browser-initiated writes — admin Edit/Delete and the
--     four sanctioned member transitions — go through SECURITY DEFINER
--     RPCs that role-check before mutating. Because SECURITY DEFINER
--     functions execute with `current_user = postgres` (the function
--     owner) the trigger's `current_user` allow-list lets them through.
--   * Admin Edit/Delete RPCs write the admin_audit_log row in the SAME
--     transaction as the mutation, so the mutation cannot succeed without
--     the audit row (best-effort JS audit logging is removed).
--
-- Sanctioned non-admin (member) transitions, each gated to the package
-- owner via maintenance_packages.member_id = auth.uid():
--   A. member_approve_additional_work(p_payment_id, p_new_total,
--                                     p_new_provider, p_new_mcc_fee)
--      Powers the upsell flow in members.js / members-packages.js /
--      members-core.js.
--   B. member_release_payment(p_package_id)
--      Powers the release-on-completion flow in members.js /
--      members-packages.js.
--   C. member_mark_payment_disputed(p_payment_id)
--      Powers the dispute filing status flip in members.js /
--      members-packages.js.
--   D. member_refund_payment_unable_to_start(p_payment_id)
--      Powers the "provider unable to start" refund flow in members.js.
--
-- OPERATOR NOTE: direct-PG sessions in the Supabase SQL Editor or psql
-- run as the postgres role and bypass the trigger naturally (they are in
-- the trusted role allow-list). pg_cron jobs running as postgres also
-- bypass.
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
-- 3. ADMIN-ONLY EDIT RPC (atomic with audit log)
-- ============================================================
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
DECLARE
  caller_id  uuid := auth.uid();
  before_row public.payments;
BEGIN
  IF NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can edit payments'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO before_row FROM public.payments WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.payments
     SET status         = p_status,
         amount_total   = p_amount_total,
         amount_mcc_fee = p_amount_mcc_fee,
         refund_amount  = p_refund_amount,
         admin_note     = p_admin_note
   WHERE id = p_id;

  -- Audit row written in the same transaction. If this insert fails the
  -- entire RPC rolls back, so no payment edit can ever succeed without a
  -- matching admin_audit_log row.
  INSERT INTO public.admin_audit_log
    (action, target_type, target_id, performed_by, metadata)
  VALUES (
    'edit_payment',
    'payment',
    p_id,
    COALESCE(caller_id::text, 'service_role'),
    jsonb_build_object(
      'before', jsonb_build_object(
        'status',         before_row.status,
        'amount_total',   before_row.amount_total,
        'amount_mcc_fee', before_row.amount_mcc_fee,
        'refund_amount',  before_row.refund_amount,
        'admin_note',     before_row.admin_note
      ),
      'after', jsonb_build_object(
        'status',         p_status,
        'amount_total',   p_amount_total,
        'amount_mcc_fee', p_amount_mcc_fee,
        'refund_amount',  p_refund_amount,
        'admin_note',     p_admin_note
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_edit_payment(uuid, text, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_edit_payment(uuid, text, numeric, numeric, numeric, text) TO authenticated;

-- ============================================================
-- 4. ADMIN-ONLY DELETE RPC (atomic with audit log)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_payment(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_id  uuid := auth.uid();
  before_row public.payments;
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

  SELECT * INTO before_row FROM public.payments WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.payments WHERE id = p_id;

  INSERT INTO public.admin_audit_log
    (action, target_type, target_id, performed_by, metadata)
  VALUES (
    'delete_payment',
    'payment',
    p_id,
    COALESCE(caller_id::text, 'service_role'),
    jsonb_build_object(
      'before', jsonb_build_object(
        'status',         before_row.status,
        'amount_total',   before_row.amount_total,
        'amount_mcc_fee', before_row.amount_mcc_fee,
        'refund_amount',  before_row.refund_amount,
        'admin_note',     before_row.admin_note,
        'package_id',     before_row.package_id,
        'member_id',      before_row.member_id,
        'provider_id',    before_row.provider_id
      ),
      'after', NULL
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_payment(uuid) TO authenticated;

-- ============================================================
-- 5. SANCTIONED MEMBER RPCs (ownership-checked, SECURITY DEFINER)
-- ============================================================
-- Helper: assert that auth.uid() owns the maintenance package.
CREATE OR REPLACE FUNCTION public.payments_assert_member_owns_package(p_package_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_packages
    WHERE id = p_package_id AND member_id = uid
  ) THEN
    RAISE EXCEPTION 'Package % is not owned by caller', p_package_id
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.payments_assert_member_owns_package(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payments_assert_member_owns_package(uuid) TO authenticated;

-- A. Approve additional work — re-prices a held payment.
CREATE OR REPLACE FUNCTION public.member_approve_additional_work(
  p_payment_id    uuid,
  p_new_total     numeric,
  p_new_provider  numeric,
  p_new_mcc_fee   numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  pkg uuid;
BEGIN
  SELECT package_id INTO pkg FROM public.payments WHERE id = p_payment_id;
  IF pkg IS NULL THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.payments_assert_member_owns_package(pkg);

  UPDATE public.payments
     SET amount_total    = p_new_total,
         amount_provider = p_new_provider,
         amount_mcc_fee  = p_new_mcc_fee
   WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.member_approve_additional_work(uuid, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_approve_additional_work(uuid, numeric, numeric, numeric) TO authenticated;

-- B. Release on completion — held -> released for every payment in a package.
CREATE OR REPLACE FUNCTION public.member_release_payment(p_package_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.payments_assert_member_owns_package(p_package_id);

  UPDATE public.payments
     SET status      = 'released',
         released_at = now()
   WHERE package_id = p_package_id;
END;
$$;

REVOKE ALL ON FUNCTION public.member_release_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_release_payment(uuid) TO authenticated;

-- C. Mark payment disputed (status flip only).
CREATE OR REPLACE FUNCTION public.member_mark_payment_disputed(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  pkg uuid;
BEGIN
  SELECT package_id INTO pkg FROM public.payments WHERE id = p_payment_id;
  IF pkg IS NULL THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.payments_assert_member_owns_package(pkg);

  UPDATE public.payments
     SET status = 'disputed'
   WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.member_mark_payment_disputed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_mark_payment_disputed(uuid) TO authenticated;

-- D. Refund — provider unable to start. refund_amount = payment.amount_total
--    is computed server-side so the client cannot inflate the refund.
CREATE OR REPLACE FUNCTION public.member_refund_payment_unable_to_start(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  pkg            uuid;
  current_total  numeric;
BEGIN
  SELECT package_id, amount_total
    INTO pkg, current_total
    FROM public.payments
   WHERE id = p_payment_id;
  IF pkg IS NULL THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.payments_assert_member_owns_package(pkg);

  UPDATE public.payments
     SET status        = 'refunded',
         refund_amount = current_total,
         refund_reason = 'Provider unable to start work',
         refunded_at   = now()
   WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.member_refund_payment_unable_to_start(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_refund_payment_unable_to_start(uuid) TO authenticated;

-- ============================================================
-- 6. ENFORCE: BLOCK ALL DIRECT NON-TRUSTED UPDATES
-- ============================================================
-- The trigger allows only:
--   * trusted Postgres roles (postgres, supabase_admin, service_role) —
--     this lets every SECURITY DEFINER RPC above through, since they run
--     with current_user = the function owner (postgres);
--   * authenticated admins (covered for direct admin SQL Editor work).
-- Everything else (direct browser updates, anon, non-admin authenticated)
-- is rejected.
CREATE OR REPLACE FUNCTION public.payments_enforce_admin_only_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF public.payments_caller_is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Direct payment edits are not allowed. Admins must use admin_edit_payment(); members must use member_approve_additional_work / member_release_payment / member_mark_payment_disputed / member_refund_payment_unable_to_start.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS payments_admin_only_columns ON public.payments;
DROP TRIGGER IF EXISTS payments_enforce_admin_only_writes ON public.payments;
CREATE TRIGGER payments_enforce_admin_only_writes
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_enforce_admin_only_writes();

-- ============================================================
-- 7. ENFORCE: BLOCK NON-ADMIN DELETES + OPEN-DISPUTE DELETES
-- ============================================================
CREATE OR REPLACE FUNCTION public.payments_block_delete_with_open_dispute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    -- Trusted role; still enforce open-dispute guard below.
    NULL;
  ELSIF NOT public.payments_caller_is_admin() THEN
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
