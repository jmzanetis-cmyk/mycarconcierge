-- ════════════════════════════════════════════════════════════════════════════
-- Task #113 — BGC notifications & portal alerts
--
-- Builds on the foundation tables from Task #112. Adds:
--   · bgc_notifications  — per-threshold dedupe log (one row per email sent).
--   · provider_alerts    — persistent in-dashboard banners (severity-coded).
--
-- Apply manually in the Supabase SQL editor (same pattern as #112). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bgc_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES provider_employees(id) ON DELETE CASCADE,
  bgc_check_id UUID NOT NULL REFERENCES employee_background_checks(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  email_to TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS provider_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES provider_employees(id) ON DELETE CASCADE,
  bgc_check_id UUID REFERENCES employee_background_checks(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,                 -- 'bgc_expiring' | 'bgc_expired' | 'compliance_lost'
  severity TEXT NOT NULL DEFAULT 'info',    -- 'info' | 'warning' | 'critical'
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  auto_resolve_on TEXT,                     -- hint for the auto-resolver, e.g. 'new_clear_check'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  is_dismissed BOOLEAN DEFAULT FALSE
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

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE bgc_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_alerts   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bgc_notif" ON bgc_notifications;
CREATE POLICY "service_role_bgc_notif"
  ON bgc_notifications FOR ALL TO service_role USING (true);

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
