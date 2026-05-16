-- ════════════════════════════════════════════════════════════════════════════
-- Task #372 — Wire real BackgroundChecks.com private + public APIs
--
-- Adds the columns needed by the live-mode integration:
--   * employee_background_checks.applicant_invite_url — the BGC-hosted
--     SSN/DOB intake link returned by POST /orders/new. Surfaced to the
--     provider so they can hand it to the employee. Never required for the
--     mock path.
--   * provider_background_check_accounts.bgchecks_api_key — the customer
--     API token returned by POST /token/decrypt after the provider completes
--     the BGC registration widget. This is the per-sub-account credential
--     used for that provider's order calls. Distinct from
--     bgchecks_account_id which is the human-readable account number from
--     the BGC console (still useful for support).
--   * provider_background_check_accounts.live_mode — explicit per-provider
--     flag so admin can tell at a glance which providers are wired to the
--     real API vs. still on the mock path. Auto-set to TRUE when an API key
--     is decrypted; can be reset by ops if the account is detached.
--   * provider_background_check_accounts.source_token — the platform source
--     token the registration was completed under (for audit / rotation).
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE employee_background_checks
  ADD COLUMN IF NOT EXISTS applicant_invite_url TEXT;

ALTER TABLE provider_background_check_accounts
  ADD COLUMN IF NOT EXISTS bgchecks_api_key TEXT,
  ADD COLUMN IF NOT EXISTS live_mode BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_token TEXT,
  ALTER COLUMN bgchecks_account_id DROP NOT NULL;

-- The original migration made bgchecks_account_id NOT NULL because the
-- only path that wrote rows was a hand-pasted account number. Now that
-- the registration-widget path writes rows that have the API key but may
-- not yet have the human-readable account ID, we relax the constraint.
-- A trigger keeps the legacy invariant: at least one of (account_id,
-- api_key) must be present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_bgc_account_has_credential'
  ) THEN
    ALTER TABLE provider_background_check_accounts
      ADD CONSTRAINT chk_bgc_account_has_credential
      CHECK (bgchecks_account_id IS NOT NULL OR bgchecks_api_key IS NOT NULL);
  END IF;
END $$;

-- ── Lock down secret columns ────────────────────────────────────────────────
-- The pre-existing `providers_own_bgchecks_account` policy lets a provider
-- SELECT their own row. That's still desirable for the non-secret columns
-- (account_id, live_mode, source_token, updated_at) so the provider
-- dashboard can display "Your sub-account is linked", but the decrypted API
-- key MUST NOT be readable by browser clients via PostgREST. PostgreSQL's
-- column-level grants take precedence over RLS, so revoking SELECT on the
-- two secret columns from `authenticated` and `anon` blocks the read even
-- when the row policy says yes. Service role keeps full access for the
-- server-side functions that legitimately need the api_key
-- (initiate-background-check.js, etc.).
REVOKE SELECT (bgchecks_api_key) ON provider_background_check_accounts FROM authenticated, anon;

-- A safe read-only view for the provider dashboard / client code that wants
-- to know whether a sub-account is linked without ever seeing the secret.
DROP VIEW IF EXISTS provider_background_check_accounts_public;
-- security_invoker = true so the view runs as the calling user and the
-- existing RLS policies on provider_background_check_accounts (which
-- restrict each provider to their own row) flow through. We deliberately
-- omit the `bgchecks_api_key` column entirely (we revoked SELECT on it
-- above) and use the `live_mode` column as the canonical "is your account
-- linked?" signal so the view's columns require no special permissions.
-- The WHERE clause is a defense-in-depth scope: even if RLS were to be
-- relaxed in the future, the view itself never returns another provider's
-- row to a logged-in user.
CREATE VIEW provider_background_check_accounts_public
WITH (security_invoker = true) AS
SELECT
  provider_id,
  bgchecks_account_id,
  live_mode,
  source_token,
  created_at,
  updated_at
FROM provider_background_check_accounts
WHERE provider_id = auth.uid();

GRANT SELECT ON provider_background_check_accounts_public TO authenticated;
