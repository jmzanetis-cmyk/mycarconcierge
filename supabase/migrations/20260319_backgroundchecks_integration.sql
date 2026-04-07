-- BackgroundChecks.com Integration
-- Adds new columns to provider_background_checks and creates accounts cache table.

-- New columns for BackgroundChecks.com on the existing table
ALTER TABLE provider_background_checks
  ADD COLUMN IF NOT EXISTS api_provider TEXT DEFAULT 'backgroundchecks',
  ADD COLUMN IF NOT EXISTS external_order_id TEXT,
  ADD COLUMN IF NOT EXISTS report_url TEXT;

CREATE INDEX IF NOT EXISTS idx_provider_bg_checks_external_order
  ON provider_background_checks (external_order_id)
  WHERE external_order_id IS NOT NULL;

-- Cache provider → BackgroundChecks.com customer account mapping
CREATE TABLE IF NOT EXISTS provider_background_check_accounts (
  provider_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bgchecks_account_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for provider_background_check_accounts
ALTER TABLE provider_background_check_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers_own_bgchecks_account" ON provider_background_check_accounts;
CREATE POLICY "providers_own_bgchecks_account"
  ON provider_background_check_accounts
  FOR ALL
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS "service_role_bgchecks_accounts" ON provider_background_check_accounts;
CREATE POLICY "service_role_bgchecks_accounts"
  ON provider_background_check_accounts
  FOR ALL
  TO service_role
  USING (true);
