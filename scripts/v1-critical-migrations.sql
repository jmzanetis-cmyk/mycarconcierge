-- ═══════════════════════════════════════════════════════════════════════════════
-- v1-critical-migrations.sql
--
-- Applies only the DDL required for the core member↔provider payment flow
-- and the employee BGC tracking flow. Everything else stays deferred.
--
-- Source migrations (verbatim SQL, stripped of non-target objects):
--   · 20260422_bgc_employee_compliance.sql   → provider_employees,
--                                               employee_background_checks,
--                                               profiles BGC columns,
--                                               calculate_provider_compliance
--   · 20260422_bgc_notifications_alerts.sql  → bgc_notifications (FK dep),
--                                               provider_alerts
--   · 20260429_admin_payments_edit_delete.sql → payments.admin_note column,
--                                               admin_edit_payment,
--                                               admin_delete_payment,
--                                               member_release_payment,
--                                               member_approve_additional_work,
--                                               member_mark_payment_disputed,
--                                               member_refund_payment_unable_to_start
--                                               + enforce triggers on payments
--
-- EXCLUDED from source files (not needed for v1 launch):
--   · provider_background_check_accounts table and its views/indices
--   · bgc-live-mode column additions (20260515e — separate migration)
--   · 20260424_admin_audit_log.sql — admin_audit_log already exists in prod
--   · 20260428e_provider_writes_rls_lockdown.sql — provider_applications
--     and profiles.suspension trigger, not on critical path
--   · increment_provider_strikes — NOT DEFINED anywhere in SQL; only a
--     client-side rpc() call in www/admin.js. Cannot be applied. Flagged
--     as a missing implementation (see note at bottom).
--
-- OPERATOR NOTES:
--   1. Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--   2. The transaction wrapper means it's all-or-nothing: if any statement
--      fails the entire run rolls back cleanly.
--   3. The payments_enforce_admin_only_writes trigger installed by Block 11
--      immediately blocks all direct browser-side UPDATE on payments for
--      non-admin, non-service-role callers. That is intentional — it is
--      the whole point of the payment RPC pattern.
--   4. Safe to re-run: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
--      FUNCTION, ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS before
--      CREATE POLICY, DROP TRIGGER IF EXISTS before CREATE TRIGGER.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 1: provider_employees
-- Required FK parent for employee_background_checks and provider_alerts.
-- Source: 20260422_bgc_employee_compliance.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_employees (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  email             TEXT,
  phone             TEXT,
  role              TEXT,
  is_customer_facing BOOLEAN    DEFAULT TRUE,
  is_active         BOOLEAN     DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_employees_provider
  ON provider_employees (provider_id, is_active);

ALTER TABLE provider_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers_own_employees" ON provider_employees;
CREATE POLICY "providers_own_employees"
  ON provider_employees FOR ALL
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "service_role_employees" ON provider_employees;
CREATE POLICY "service_role_employees"
  ON provider_employees FOR ALL TO service_role
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 2: employee_background_checks
-- Source: 20260422_bgc_employee_compliance.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_background_checks (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   UUID    NOT NULL REFERENCES provider_employees(id) ON DELETE CASCADE,
  provider_id   UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bgc_report_id TEXT    UNIQUE,
  status        TEXT    DEFAULT 'pending',
  initiated_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  is_current    BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_bgc_emp_status'
  ) THEN
    ALTER TABLE employee_background_checks
      ADD CONSTRAINT chk_bgc_emp_status
      CHECK (status IN ('pending', 'clear', 'consider', 'failed', 'expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_emp_bgc_report_id
  ON employee_background_checks (bgc_report_id);
CREATE INDEX IF NOT EXISTS idx_emp_bgc_employee_current
  ON employee_background_checks (employee_id, is_current);
CREATE INDEX IF NOT EXISTS idx_emp_bgc_expires_active
  ON employee_background_checks (expires_at)
  WHERE is_current = TRUE;

ALTER TABLE employee_background_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers_own_emp_bgc" ON employee_background_checks;
CREATE POLICY "providers_own_emp_bgc"
  ON employee_background_checks FOR SELECT
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "service_role_emp_bgc" ON employee_background_checks;
CREATE POLICY "service_role_emp_bgc"
  ON employee_background_checks FOR ALL TO service_role
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 3: BGC compliance summary columns on profiles
-- Source: 20260422_bgc_employee_compliance.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bgc_total_employees     INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bgc_compliant_employees INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bgc_compliance_pct      NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bgc_badge_verified      BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bgc_last_computed_at    TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 4: calculate_provider_compliance RPC
-- Source: 20260422_bgc_employee_compliance.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION calculate_provider_compliance(p_provider_id UUID)
RETURNS void AS $$
DECLARE
  v_total     INTEGER;
  v_compliant INTEGER;
  v_pct       NUMERIC(5,2);
  v_badge     BOOLEAN;
BEGIN
  SELECT COUNT(*)
    INTO v_total
    FROM provider_employees
   WHERE provider_id = p_provider_id
     AND is_active = TRUE
     AND is_customer_facing = TRUE;

  SELECT COUNT(*)
    INTO v_compliant
    FROM provider_employees pe
    JOIN employee_background_checks ebc ON ebc.employee_id = pe.id
   WHERE pe.provider_id = p_provider_id
     AND pe.is_active = TRUE
     AND pe.is_customer_facing = TRUE
     AND ebc.is_current = TRUE
     AND ebc.status = 'clear'
     AND ebc.expires_at > NOW();

  IF v_total > 0 THEN
    v_pct := (v_compliant::NUMERIC / v_total::NUMERIC) * 100;
  ELSE
    v_pct := 0;
  END IF;

  v_badge := (v_pct >= 90 AND v_total > 0);

  UPDATE profiles
     SET bgc_total_employees     = v_total,
         bgc_compliant_employees = v_compliant,
         bgc_compliance_pct      = v_pct,
         bgc_badge_verified      = v_badge,
         bgc_last_computed_at    = NOW()
   WHERE id = p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 5: bgc_notifications
-- Not in the requested object list but is a hard FK parent of provider_alerts
-- (bgc_check_id references employee_background_checks; the table itself is
-- referenced by FK from provider_alerts). Must precede BLOCK 6.
-- Source: 20260422_bgc_notifications_alerts.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bgc_notifications (
  id                UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id       UUID  NOT NULL REFERENCES provider_employees(id) ON DELETE CASCADE,
  bgc_check_id      UUID  NOT NULL REFERENCES employee_background_checks(id) ON DELETE CASCADE,
  notification_type TEXT  NOT NULL,
  email_to          TEXT,
  sent_at           TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_bgc_notif_dedupe'
  ) THEN
    ALTER TABLE bgc_notifications
      ADD CONSTRAINT uq_bgc_notif_dedupe
      UNIQUE (employee_id, notification_type, bgc_check_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bgc_notif_check ON bgc_notifications(bgc_check_id);

ALTER TABLE bgc_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bgc_notif" ON bgc_notifications;
CREATE POLICY "service_role_bgc_notif"
  ON bgc_notifications FOR ALL TO service_role USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 6: provider_alerts
-- Source: 20260422_bgc_notifications_alerts.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_alerts (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id     UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id     UUID    REFERENCES provider_employees(id) ON DELETE CASCADE,
  bgc_check_id    UUID    REFERENCES employee_background_checks(id) ON DELETE CASCADE,
  alert_type      TEXT    NOT NULL,
  severity        TEXT    NOT NULL DEFAULT 'info',
  title           TEXT    NOT NULL,
  body            TEXT,
  action_url      TEXT,
  auto_resolve_on TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  is_dismissed    BOOLEAN DEFAULT FALSE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_provider_alerts_severity'
  ) THEN
    ALTER TABLE provider_alerts
      ADD CONSTRAINT chk_provider_alerts_severity
      CHECK (severity IN ('info', 'warning', 'critical'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_provider_alerts_type'
  ) THEN
    ALTER TABLE provider_alerts
      ADD CONSTRAINT chk_provider_alerts_type
      CHECK (alert_type IN ('bgc_expiring', 'bgc_expired', 'compliance_lost'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_provider_alerts_active
  ON provider_alerts (provider_id)
  WHERE resolved_at IS NULL AND is_dismissed = FALSE;
CREATE INDEX IF NOT EXISTS idx_provider_alerts_employee_open
  ON provider_alerts (employee_id, alert_type)
  WHERE resolved_at IS NULL;

ALTER TABLE provider_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers_read_own_alerts" ON provider_alerts;
CREATE POLICY "providers_read_own_alerts"
  ON provider_alerts FOR SELECT
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "providers_dismiss_own_alerts" ON provider_alerts;
CREATE POLICY "providers_dismiss_own_alerts"
  ON provider_alerts FOR UPDATE
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS "service_role_provider_alerts" ON provider_alerts;
CREATE POLICY "service_role_provider_alerts"
  ON provider_alerts FOR ALL TO service_role USING (true);

CREATE OR REPLACE FUNCTION restrict_provider_alerts_dismiss_only()
RETURNS trigger AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.alert_type      := OLD.alert_type;
  NEW.severity        := OLD.severity;
  NEW.title           := OLD.title;
  NEW.body            := OLD.body;
  NEW.action_url      := OLD.action_url;
  NEW.provider_id     := OLD.provider_id;
  NEW.employee_id     := OLD.employee_id;
  NEW.bgc_check_id    := OLD.bgc_check_id;
  NEW.created_at      := OLD.created_at;
  NEW.resolved_at     := OLD.resolved_at;
  NEW.auto_resolve_on := OLD.auto_resolve_on;
  NEW.updated_at      := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_restrict_provider_alerts ON provider_alerts;
CREATE TRIGGER trg_restrict_provider_alerts
  BEFORE UPDATE ON provider_alerts
  FOR EACH ROW EXECUTE FUNCTION restrict_provider_alerts_dismiss_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 7: payments.admin_note column
-- Source: 20260429_admin_payments_edit_delete.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS admin_note text;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 8: payments helper functions (called by all payment RPCs below)
-- Source: 20260429_admin_payments_edit_delete.sql
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 9: admin_edit_payment RPC
-- Writes to admin_audit_log (already exists in prod) in the same transaction.
-- Source: 20260429_admin_payments_edit_delete.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_edit_payment(
  p_id             uuid,
  p_status         text,
  p_amount_total   numeric,
  p_amount_mcc_fee numeric,
  p_refund_amount  numeric,
  p_admin_note     text
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

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 10: admin_delete_payment RPC
-- Checks for open disputes (disputes table already exists in prod).
-- Source: 20260429_admin_payments_edit_delete.sql
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 11: member payment RPCs (A–D)
-- Source: 20260429_admin_payments_edit_delete.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- A. Approve additional work — re-prices a held payment (upsell flow).
CREATE OR REPLACE FUNCTION public.member_approve_additional_work(
  p_payment_id   uuid,
  p_new_total    numeric,
  p_new_provider numeric,
  p_new_mcc_fee  numeric
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

-- B. Release on completion — held → released for every payment in a package.
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

-- D. Refund — provider unable to start.
--    refund_amount is read from the row server-side; client cannot inflate it.
CREATE OR REPLACE FUNCTION public.member_refund_payment_unable_to_start(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  pkg           uuid;
  current_total numeric;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 12: enforce triggers on payments
-- IMPORTANT: after this point, all direct non-admin browser-side UPDATEs
-- on the payments table are rejected at the DB level. Members must use
-- the four RPCs above; admins must use admin_edit_payment / admin_delete_payment.
-- Source: 20260429_admin_payments_edit_delete.sql
-- ─────────────────────────────────────────────────────────────────────────────

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

CREATE OR REPLACE FUNCTION public.payments_block_delete_with_open_dispute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    NULL;
  ELSIF NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete payments'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.disputes d
    WHERE d.payment_id = OLD.id AND d.status = 'open'
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

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTE: increment_provider_strikes
--
-- This RPC is called in www/admin.js:4146 but has NO SQL implementation in any
-- migration file in the repo. It cannot be applied here. Before the next release
-- that exercises the strikes UI, a migration must be written and applied:
--
--   CREATE OR REPLACE FUNCTION public.increment_provider_strikes(
--     provider_id uuid, reason text DEFAULT NULL
--   )
--   RETURNS void ...
--
-- Until then, the client-side call silently errors (Supabase returns a
-- PGRST202 "function not found" that the UI swallows).
-- ═══════════════════════════════════════════════════════════════════════════════
