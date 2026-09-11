-- provider_background_checks: documents + fills in the full shape of a
-- table that predates this repo's migration-tracking discipline -- no
-- CREATE TABLE for it exists anywhere in supabase/migrations/, only the
-- 2026-03-19 migration's additive ALTERs. It is read live today by
-- directory-providers.js (member-facing directory BGC badge) and
-- provider-documents.js (provider's own document list), and was formerly
-- written by the now-retired Checkr integration in server.js
-- (checkr_candidate_id / checkr_invitation_id columns below -- Checkr was
-- dropped for BackgroundChecks.com, confirmed with Jordan 2026-09-11).
--
-- Unlike employee_background_checks (20260422_bgc_employee_compliance.sql,
-- Task #372's employee-only compliance-badge system -- untouched by this
-- migration), this table has always supported BOTH:
--   subject_type = 'provider' -- the provider's own check
--   subject_type = 'employee' -- a team_members row's check (employee_id)
-- which is exactly the shape the provider-facing "Background Checks" tab
-- UI in www/providers.js / www/providers-settings.js already expects and
-- renders (it was simply never wired to a live backend -- see
-- bgc-provider-status.js / bgc-provider-initiate.js / bgc-provider-report-url.js).
--
-- CREATE TABLE IF NOT EXISTS + additive ADD COLUMN IF NOT EXISTS throughout
-- so this is a no-op where a column already exists and safe to run
-- regardless of the table's actual current shape in prod.
--
-- No FK on employee_id -> team_members(id): team_members is itself an
-- undocumented table (no CREATE TABLE in supabase/migrations/ either), so
-- this follows the same deliberately-unconstrained-uuid precedent already
-- used for split_payments.package_id elsewhere in this schema rather than
-- risk a migration failure against an FK target whose exact shape can't be
-- confirmed from the migration history.

CREATE TABLE IF NOT EXISTS provider_background_checks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id           uuid,
  subject_type          text NOT NULL DEFAULT 'provider',
  subject_first_name    text,
  subject_last_name     text,
  subject_email         text,
  subject_phone         text,
  work_location_state   text,
  status                text NOT NULL DEFAULT 'pending',
  checkr_candidate_id   text,
  checkr_invitation_id  text,
  invitation_url        text,
  api_provider          text DEFAULT 'backgroundchecks',
  external_order_id     text,
  report_url            text,
  report_widget_url     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS employee_id           uuid;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS subject_type          text NOT NULL DEFAULT 'provider';
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS subject_first_name    text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS subject_last_name     text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS subject_email         text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS subject_phone         text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS work_location_state   text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS status                text NOT NULL DEFAULT 'pending';
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS checkr_candidate_id   text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS checkr_invitation_id  text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS invitation_url        text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS api_provider          text DEFAULT 'backgroundchecks';
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS external_order_id     text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS report_url            text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS report_widget_url     text;
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS updated_at            timestamptz NOT NULL DEFAULT now();
ALTER TABLE provider_background_checks ADD COLUMN IF NOT EXISTS completed_at          timestamptz;

CREATE INDEX IF NOT EXISTS idx_provider_bg_checks_provider_id   ON provider_background_checks(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_bg_checks_employee_id   ON provider_background_checks(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_bg_checks_subject_type  ON provider_background_checks(provider_id, subject_type);

ALTER TABLE provider_background_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers_own_bg_checks" ON provider_background_checks;
CREATE POLICY "providers_own_bg_checks"
  ON provider_background_checks FOR SELECT
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "service_role_bg_checks" ON provider_background_checks;
CREATE POLICY "service_role_bg_checks"
  ON provider_background_checks FOR ALL
  TO service_role
  USING (true);
