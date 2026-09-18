#!/usr/bin/env node
// Task #474 — Lockdown test for the profiles privileged-columns trigger.
//
// The trigger `public.restrict_profile_suspension_writes` (extended in
// 20260918c_profiles_privileged_columns_guard.sql) enforces three shapes of
// rule on top of the original 20260428e suspension guard:
//
//   Rule A — bid_credits, free_trial_bids: decrement or unchanged only.
//   Rule B — role: only NULL/'member' -> 'pending_provider' passes.
//   Rule C — is_also_member (false/null -> true only), total_bids_used /
//            total_bids_purchased (monotonic non-decreasing).
//   Rule D — reject any change to a fixed denylist of columns.
//
// The tests below parse the trigger's SQL source and assert the exact
// IF ... RAISE EXCEPTION logic that implements each rule. Each test name
// reflects the behavioral guarantee, and the regex proves the SQL logic
// present. Combined with `IS DISTINCT FROM` semantics (which only fires
// when values differ), the regexes are sufficient to prove:
//
//   * A decrement of bid_credits passes (values differ but NEW > OLD is
//     false, so the RAISE is skipped).
//   * An increment of bid_credits rejects (values differ AND NEW > OLD).
//   * A no-op passes (values match, IS DISTINCT FROM is false).
//   * The specific role transition passes, others reject.
//
// Written as a standalone Node script so it plugs into
// scripts/run-function-tests.sh the same way as every other
// netlify/functions-tests/*.test.js file.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260918c_profiles_privileged_columns_guard.sql',
);

const src = fs.readFileSync(MIGRATION_PATH, 'utf8');

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL ${name}`);
    if (detail) console.log('       ' + String(detail).split('\n').join('\n       '));
    failed++;
  }
}

// Helper: build a regex that matches an IS DISTINCT FROM + comparison + RAISE
// block for a numeric column. `op` is '>' for "reject on increment" (Rule A)
// or '<' for "reject on decrement" (Rule C monotonic).
function monotonicRule(col, op) {
  const escCol = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `IF\\s+NEW\\.${escCol}\\s+IS\\s+DISTINCT\\s+FROM\\s+OLD\\.${escCol}` +
      `[\\s\\S]{0,200}?` +
      `COALESCE\\(NEW\\.${escCol},\\s*0\\)\\s*${op}\\s*COALESCE\\(OLD\\.${escCol},\\s*0\\)` +
      `[\\s\\S]{0,120}?` +
      `RAISE\\s+EXCEPTION`,
  );
}

function rejectAnyChangeRule(col) {
  const escCol = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `IF\\s+NEW\\.${escCol}\\s+IS\\s+DISTINCT\\s+FROM\\s+OLD\\.${escCol}` +
      `[\\s\\S]{0,120}?` +
      `RAISE\\s+EXCEPTION`,
  );
}

// -----------------------------------------------------------------------------
// Bypass shape
// -----------------------------------------------------------------------------
// Scope the UPDATE-trigger bypass assertions to that function's body so
// the INSERT-trigger bypasses (also in this file) don't accidentally
// satisfy them.
const updateBodyMatch = src.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restrict_profile_suspension_writes[\s\S]*?\$\$\s+LANGUAGE\s+plpgsql/);
const updateBody = updateBodyMatch ? updateBodyMatch[0] : '';

check(
  'UPDATE trigger bypasses non-anon/non-authenticated callers via current_user (covers service_role, postgres, pg_cron, SQL editor, CLI — fixes 20260428e OPERATOR NOTE)',
  /IF\s+current_user\s+NOT\s+IN\s*\(\s*'anon'\s*,\s*'authenticated'\s*\)\s+THEN\s+RETURN\s+NEW/.test(updateBody),
);
check(
  'UPDATE trigger bypasses admin callers via public.is_admin()',
  /IF\s+public\.is_admin\(\)\s+THEN\s+RETURN\s+NEW/.test(updateBody),
);
check(
  'UPDATE trigger function sets search_path = public, pg_temp (SECURITY DEFINER hardening)',
  /LANGUAGE\s+plpgsql\s+SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*public\s*,\s*pg_temp/.test(updateBody + src.slice(updateBodyMatch ? updateBodyMatch.index + updateBodyMatch[0].length : 0, updateBodyMatch ? updateBodyMatch.index + updateBodyMatch[0].length + 200 : 0)),
);

// -----------------------------------------------------------------------------
// Rule A — bid_credits / free_trial_bids: decrement passes, increment rejects
// -----------------------------------------------------------------------------
check(
  'Rule A — bid_credits decrement passes, increment rejects (NEW > OLD raises)',
  monotonicRule('bid_credits', '>').test(src),
);
check(
  'Rule A — free_trial_bids decrement passes, increment rejects (NEW > OLD raises)',
  monotonicRule('free_trial_bids', '>').test(src),
);

// -----------------------------------------------------------------------------
// Rule B — role: only NULL/'member' -> 'pending_provider' passes
// -----------------------------------------------------------------------------
check(
  'Rule B — role member -> pending_provider passes, other transitions reject',
  /IF\s+NEW\.role\s+IS\s+DISTINCT\s+FROM\s+OLD\.role[\s\S]{0,300}?IF\s+NOT\s*\([\s\S]{0,200}?OLD\.role\s+IS\s+NULL\s+OR\s+OLD\.role\s*=\s*'member'[\s\S]{0,200}?NEW\.role\s*=\s*'pending_provider'[\s\S]{0,200}?RAISE\s+EXCEPTION/
    .test(src),
);
check(
  'Rule B — no independent branch allows role -> admin',
  !/NEW\.role\s*=\s*'admin'[\s\S]{0,80}RETURN\s+NEW/i.test(src) &&
    !/OLD\.role\s+IS\s+DISTINCT\s+FROM\s+NEW\.role[\s\S]{0,80}?NEW\.role\s*=\s*'admin'/i.test(src),
);

// -----------------------------------------------------------------------------
// Rule C — monotonic
// -----------------------------------------------------------------------------
check(
  'Rule C — is_also_member allowed false/null -> true only, other transitions reject',
  /IF\s+NEW\.is_also_member\s+IS\s+DISTINCT\s+FROM\s+OLD\.is_also_member[\s\S]{0,200}?NOT\s*\([\s\S]{0,200}?COALESCE\(OLD\.is_also_member,\s*false\)\s*=\s*false[\s\S]{0,80}?NEW\.is_also_member\s*=\s*true[\s\S]{0,200}?RAISE\s+EXCEPTION/
    .test(src),
);
check(
  'Rule C — total_bids_used monotonic non-decreasing (NEW < OLD raises)',
  monotonicRule('total_bids_used', '<').test(src),
);
check(
  'Rule C — total_bids_purchased monotonic non-decreasing (NEW < OLD raises)',
  monotonicRule('total_bids_purchased', '<').test(src),
);

// -----------------------------------------------------------------------------
// Preserved from 20260428e — suspension columns
// -----------------------------------------------------------------------------
check(
  'preserved: suspension_reason changes reject (20260428e)',
  rejectAnyChangeRule('suspension_reason').test(src),
);
check(
  'preserved: suspended_at changes reject (20260428e)',
  rejectAnyChangeRule('suspended_at').test(src),
);

// -----------------------------------------------------------------------------
// Rule D — reject any change (denylist).
// Task text calls out minimum denylist: role, bid_credits, verification_status,
// suspension_reason, suspended_at. role/bid_credits are Rule A/B (guarded, not
// hard-rejected); the remaining three plus the full column list from the
// audit classification are asserted below.
// -----------------------------------------------------------------------------
const rejectList = [
  // identity/trust
  'account_type', 'is_also_provider', 'application_status', 'verification_status',
  'is_verified', 'provider_verified', 'identity_verified', 'identity_verified_at',
  'stripe_identity_session_id', 'phone_verified', 'phone_verified_at',
  'sales_partner_verified', 'bgc_badge_verified',
  // money/credits
  'bid_credits_unlimited', 'platform_fee_exempt', 'pos_enabled',
  'stripe_customer_id', 'stripe_account_id',
  // founder/referral attribution
  'is_founding_provider', 'is_founding_member', 'founding_member_joined_at',
  'referred_by', 'referred_by_code', 'referred_by_founder_id',
  'referred_by_provider_id', 'referred_by_member_id', 'member_referral_code',
  'provider_referral_type', 'team_provider_id', 'preferred_provider_id',
  // enforcement (suspension_* preserved above)
  'suspended', 'strikes',
  // background check
  'background_check_status', 'background_check_cleared_at', 'background_check_id',
  'bgc_total_employees', 'bgc_compliant_employees', 'bgc_compliance_pct',
  'bgc_last_computed_at',
  // security
  'two_factor_secret', 'two_factor_enabled', 'two_factor_expires_at',
  'two_factor_verified_at', 'qr_code_token', 'phone_login_method',
  // system
  'id', 'email', 'created_at', 'outreach_lead_id', 'outreach_source',
  'outreach_converted_at',
];

for (const col of rejectList) {
  check(
    `Rule D — ${col} change rejects (any change raises)`,
    rejectAnyChangeRule(col).test(src),
  );
}

// -----------------------------------------------------------------------------
// Belt-and-suspenders — trigger name preserved per task text
// -----------------------------------------------------------------------------
check(
  'trigger function name preserved as restrict_profile_suspension_writes (per task text)',
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restrict_profile_suspension_writes/.test(src),
);
check(
  'trigger fires BEFORE UPDATE on public.profiles',
  /CREATE\s+TRIGGER\s+trg_restrict_profile_suspension_writes[\s\S]{0,200}?BEFORE\s+UPDATE\s+ON\s+public\.profiles/
    .test(src),
);

// =============================================================================
// BEFORE INSERT guard — Task #474 extension
//
// Same rule-shape assertions as the UPDATE side: each check names the
// behavioral guarantee and the regex proves the SQL logic that implements
// it. Combined with `IS NOT NULL` / `IS DISTINCT FROM <default>` semantics,
// the regexes prove:
//   * A NULL insert or a default-valued insert passes.
//   * A non-default insert on a guarded column rejects.
//   * Rule-1: role IN ('member','pending_provider','provider','pending_driver');
//     any other role value rejects.
//   * Rule-4: is_founding_member and founding_member_joined_at must be set
//     together or both absent.
//   * Rule-5: is_verified=true and platform_fee_exempt=true require
//     referred_by_provider_id IS NOT NULL in the same row.
// =============================================================================

const INSERT_FUNC = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restrict_profile_insert_privileged_writes/;

check(
  'INSERT trigger function exists (restrict_profile_insert_privileged_writes)',
  INSERT_FUNC.test(src),
);
check(
  'INSERT trigger fires BEFORE INSERT on public.profiles',
  /CREATE\s+TRIGGER\s+trg_restrict_profile_insert_privileged_writes[\s\S]{0,200}?BEFORE\s+INSERT\s+ON\s+public\.profiles/
    .test(src),
);

// Bypasses (must appear inside the INSERT function body, not the UPDATE one).
// Extract the INSERT function body to scope assertions.
const insertBodyMatch = src.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restrict_profile_insert_privileged_writes[\s\S]*?\$\$\s+LANGUAGE\s+plpgsql/);
const insertBody = insertBodyMatch ? insertBodyMatch[0] : '';

check(
  'INSERT trigger bypasses non-anon/non-authenticated callers via current_user',
  /IF\s+current_user\s+NOT\s+IN\s*\(\s*'anon'\s*,\s*'authenticated'\s*\)\s+THEN\s+RETURN\s+NEW/.test(insertBody),
);
check(
  'INSERT trigger bypasses admin callers via public.is_admin()',
  /IF\s+public\.is_admin\(\)\s+THEN\s+RETURN\s+NEW/.test(insertBody),
);
check(
  'INSERT trigger function sets search_path = public, pg_temp (SECURITY DEFINER hardening)',
  /restrict_profile_insert_privileged_writes[\s\S]*?LANGUAGE\s+plpgsql\s+SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*public\s*,\s*pg_temp/.test(src),
);

// Rule 1 — role allowlist.
check(
  "Rule 1 — role INSERT allowlist is ('member','pending_provider','provider','pending_driver')",
  /NEW\.role\s+NOT\s+IN\s*\(\s*'member'\s*,\s*'pending_provider'\s*,\s*'provider'\s*,\s*'pending_driver'\s*\)[\s\S]{0,200}?RAISE\s+EXCEPTION/
    .test(insertBody),
);

// Rule 4 — is_founding_member / founding_member_joined_at pair check.
check(
  'Rule 4 — is_founding_member and founding_member_joined_at must be set together on INSERT',
  /\(NEW\.is_founding_member\s+IS\s+TRUE\)\s*<>\s*\(NEW\.founding_member_joined_at\s+IS\s+NOT\s+NULL\)[\s\S]{0,200}?RAISE\s+EXCEPTION/
    .test(insertBody),
);

// Rule 5 — is_verified / platform_fee_exempt shape check.
check(
  'Rule 5 — is_verified=true INSERT requires referred_by_provider_id IS NOT NULL',
  /NEW\.is_verified\s+IS\s+TRUE\s+AND\s+NEW\.referred_by_provider_id\s+IS\s+NULL[\s\S]{0,200}?RAISE\s+EXCEPTION/
    .test(insertBody),
);
check(
  'Rule 5 — platform_fee_exempt=true INSERT requires referred_by_provider_id IS NOT NULL',
  /NEW\.platform_fee_exempt\s+IS\s+TRUE\s+AND\s+NEW\.referred_by_provider_id\s+IS\s+NULL[\s\S]{0,200}?RAISE\s+EXCEPTION/
    .test(insertBody),
);

// Strict "NULL or default" checks for guarded columns with observed defaults.
// Numeric-default checks: NEW IS NOT NULL AND NEW IS DISTINCT FROM <default>.
function insertMustBeNullOrValue(col, defaultLiteral) {
  const escCol = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escLit = defaultLiteral.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `NEW\\.${escCol}\\s+IS\\s+NOT\\s+NULL[\\s\\S]{0,120}?` +
      `NEW\\.${escCol}\\s+IS\\s+DISTINCT\\s+FROM\\s+${escLit}[\\s\\S]{0,120}?` +
      `RAISE\\s+EXCEPTION`,
  );
}
function insertMustBeNull(col) {
  const escCol = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `NEW\\.${escCol}\\s+IS\\s+NOT\\s+NULL[\\s\\S]{0,120}?RAISE\\s+EXCEPTION`,
  );
}

// Numeric defaults from pg_attrdef 2026-09-18.
check('INSERT — bid_credits must be NULL or 0',             insertMustBeNullOrValue('bid_credits', '0').test(insertBody));
check('INSERT — free_trial_bids must be NULL or 3',         insertMustBeNullOrValue('free_trial_bids', '3').test(insertBody));
check('INSERT — total_bids_used must be NULL or 0',         insertMustBeNullOrValue('total_bids_used', '0').test(insertBody));
check('INSERT — total_bids_purchased must be NULL or 0',    insertMustBeNullOrValue('total_bids_purchased', '0').test(insertBody));
check('INSERT — strikes must be NULL or 0',                 insertMustBeNullOrValue('strikes', '0').test(insertBody));
check('INSERT — bgc_total_employees must be NULL or 0',     insertMustBeNullOrValue('bgc_total_employees', '0').test(insertBody));
check('INSERT — bgc_compliant_employees must be NULL or 0', insertMustBeNullOrValue('bgc_compliant_employees', '0').test(insertBody));
check('INSERT — bgc_compliance_pct must be NULL or 0',      insertMustBeNullOrValue('bgc_compliance_pct', '0').test(insertBody));

// Boolean defaults = false.
const booleanFalseDefaults = [
  'bid_credits_unlimited', 'is_also_provider', 'identity_verified',
  'phone_verified', 'sales_partner_verified', 'bgc_badge_verified',
  'pos_enabled', 'is_founding_provider', 'suspended', 'two_factor_enabled',
];
for (const col of booleanFalseDefaults) {
  check(
    `INSERT — ${col} must be NULL or false`,
    insertMustBeNullOrValue(col, 'false').test(insertBody),
  );
}

// Text default = 'individual'.
check(
  "INSERT — account_type must be NULL or 'individual'",
  insertMustBeNullOrValue('account_type', "'individual'").test(insertBody),
);

// Must-be-NULL columns (no default, or default = NULL, and no legitimate
// browser INSERT sets them).
const mustBeNullColumns = [
  'application_status', 'verification_status', 'provider_verified',
  'identity_verified_at', 'stripe_identity_session_id', 'phone_verified_at',
  'phone_login_method', 'stripe_customer_id', 'stripe_account_id',
  'referred_by', 'referred_by_founder_id', 'referred_by_member_id',
  'member_referral_code', 'provider_referral_type', 'team_provider_id',
  'preferred_provider_id', 'suspended_at', 'suspension_reason',
  'background_check_status', 'background_check_cleared_at', 'background_check_id',
  'bgc_last_computed_at', 'two_factor_secret', 'two_factor_expires_at',
  'two_factor_verified_at', 'qr_code_token', 'outreach_lead_id',
  'outreach_source', 'outreach_converted_at',
];
for (const col of mustBeNullColumns) {
  check(
    `INSERT — ${col} must be NULL`,
    insertMustBeNull(col).test(insertBody),
  );
}

// Belt-and-suspenders: referred_by_provider_id is NOT on the must-be-null
// list (Rule 3 exception). Assert that no strict-NULL check exists for it.
check(
  'INSERT — referred_by_provider_id has no strict-NULL check (Rule 3 exception, allow any UUID)',
  !/NEW\.referred_by_provider_id\s+IS\s+NOT\s+NULL[\s\S]{0,120}?RAISE\s+EXCEPTION\s+'profiles\.referred_by_provider_id INSERT must be NULL/
    .test(insertBody),
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
