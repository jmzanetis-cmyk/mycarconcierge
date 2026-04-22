-- ════════════════════════════════════════════════════════════════════════════
-- Task #112 — Employee-level BackgroundChecks.com compliance
--
-- Adds employee-level background-check tracking on top of the existing
-- provider-level tables (which are left untouched).
--
-- In this codebase the "providers" table is `profiles` (polymorphic, with
-- role='provider'); all FKs that the source PDF wrote against `providers`
-- are mapped to `profiles` here.
--
-- Apply manually in the Supabase SQL editor (same pattern as Task #108).
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Employees ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_customer_facing BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_employees_provider
  ON provider_employees (provider_id, is_active);

-- ─── Background-check records (one per check per employee) ──────────────────
CREATE TABLE IF NOT EXISTS employee_background_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES provider_employees(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bgc_report_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

-- ─── Provider compliance summary columns (cached on profiles) ───────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bgc_total_employees INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bgc_compliant_employees INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bgc_compliance_pct NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bgc_badge_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bgc_last_computed_at TIMESTAMPTZ;

-- ─── Compliance recompute function (called from webhook + sweep + initiate)──
CREATE OR REPLACE FUNCTION calculate_provider_compliance(p_provider_id UUID)
RETURNS void AS $$
DECLARE
  v_total INTEGER;
  v_compliant INTEGER;
  v_pct NUMERIC(5,2);
  v_badge BOOLEAN;
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

-- ─── Row-Level Security ─────────────────────────────────────────────────────
ALTER TABLE provider_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_background_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers_own_employees" ON provider_employees;
CREATE POLICY "providers_own_employees"
  ON provider_employees
  FOR ALL
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "service_role_employees" ON provider_employees;
CREATE POLICY "service_role_employees"
  ON provider_employees
  FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "providers_own_emp_bgc" ON employee_background_checks;
CREATE POLICY "providers_own_emp_bgc"
  ON employee_background_checks
  FOR SELECT
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "service_role_emp_bgc" ON employee_background_checks;
CREATE POLICY "service_role_emp_bgc"
  ON employee_background_checks
  FOR ALL
  TO service_role
  USING (true);
