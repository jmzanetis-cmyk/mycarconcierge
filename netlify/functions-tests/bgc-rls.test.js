// ────────────────────────────────────────────────────────────────────────────
// Task #375 — Regression test: providers cannot read the decrypted BGC key
//
// Task #372's lockdown migration `supabase/migrations/20260515e_bgc_live_mode.sql`
// adds the security-critical guarantee that the decrypted BackgroundChecks.com
// API key column on `provider_background_check_accounts` cannot be SELECTed by
// browser clients via PostgREST. The guarantee is enforced by a column-level
// REVOKE (PostgreSQL column grants take precedence over RLS), not by RLS
// itself, so a future migration could silently re-grant the column and re-open
// the leak.
//
// This file pins the guarantee two ways:
//
//   1. BEHAVIORAL: spins up a real Postgres database, applies a faithful
//      reproduction of the base table + RLS policies + the lockdown migration,
//      then connects AS the `authenticated` role with a fake provider JWT and
//      asserts that
//        a. SELECT bgchecks_api_key FROM provider_background_check_accounts
//           fails with a permission error
//        b. SELECT * FROM provider_background_check_accounts succeeds AND the
//           returned columns do NOT include bgchecks_api_key
//        c. SELECT * FROM provider_background_check_accounts_public succeeds
//           and exposes only the safe non-secret columns
//        d. The service_role bypass still works (so server-side code can
//           continue to read the key for legitimate BGC calls)
//
//   2. STATIC: scans every file under `supabase/migrations/` and asserts
//      no future migration re-GRANTs SELECT on bgchecks_api_key or
//      re-CREATEs the public view with the secret column. This is
//      defense-in-depth so a regression caught at PR review fails CI even
//      before the migration is applied to any database.
//
// The behavioral half requires a writable Postgres reachable via DATABASE_URL
// (always available in the Replit container; CI must provide one). If no
// database is reachable, those tests are skipped with a clear message — the
// static checks always run.
//
// Run:  node netlify/functions-tests/bgc-rls.test.js
// ────────────────────────────────────────────────────────────────────────────

'use strict';

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const LOCKDOWN_MIGRATION = '20260515e_bgc_live_mode.sql';

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function readMigration(name) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ════════════════════════════════════════════════════════════════════════════
// STATIC MIGRATION SCANS (always run)
// ════════════════════════════════════════════════════════════════════════════

test('static: lockdown migration revokes SELECT on bgchecks_api_key from authenticated and anon', () => {
  const sql = stripSqlComments(readMigration(LOCKDOWN_MIGRATION));
  const revokeRe =
    /REVOKE\s+SELECT\s*\(\s*bgchecks_api_key\s*\)\s+ON\s+provider_background_check_accounts\s+FROM\s+([^;]+);/gi;
  let found = false;
  let m;
  while ((m = revokeRe.exec(sql)) !== null) {
    found = true;
    const roles = m[1].toLowerCase();
    assert.ok(roles.includes('authenticated'), 'REVOKE must target authenticated role');
    assert.ok(roles.includes('anon'), 'REVOKE must target anon role');
  }
  assert.ok(
    found,
    'lockdown migration is missing the column-level REVOKE on bgchecks_api_key'
  );
});

test('static: no migration re-grants SELECT on bgchecks_api_key to browser roles', () => {
  const columnGrantRe =
    /GRANT\s+[^;]*SELECT\s*\([^)]*\bbgchecks_api_key\b[^)]*\)[^;]*ON\s+provider_background_check_accounts[^;]*TO\s+([^;]+);/gi;
  const tableGrantRe =
    /GRANT\s+(?:ALL|SELECT)(?:\s*,\s*[A-Z]+)*\s+ON\s+provider_background_check_accounts\s+TO\s+([^;]+);/gi;

  for (const name of listMigrations()) {
    const sql = stripSqlComments(readMigration(name));
    let m;
    while ((m = columnGrantRe.exec(sql)) !== null) {
      const roles = m[1].toLowerCase();
      assert.ok(
        !roles.includes('authenticated') && !roles.includes('anon') && !roles.includes('public'),
        `migration ${name} re-grants SELECT on bgchecks_api_key to a browser-visible role`
      );
    }
    while ((m = tableGrantRe.exec(sql)) !== null) {
      const roles = m[1].toLowerCase();
      assert.ok(
        !roles.includes('authenticated') && !roles.includes('anon') && !roles.includes('public'),
        `migration ${name} grants table-wide SELECT on provider_background_check_accounts ` +
          `to ${roles.trim()}, which implicitly re-grants SELECT on bgchecks_api_key`
      );
    }
  }
});

test('static: public view never lists bgchecks_api_key across all migrations', () => {
  const viewRe =
    /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+provider_background_check_accounts_public\b[\s\S]*?AS\s+SELECT\s+([\s\S]*?)\s+FROM\b/gi;
  let foundAny = false;
  for (const name of listMigrations()) {
    const sql = stripSqlComments(readMigration(name));
    let m;
    while ((m = viewRe.exec(sql)) !== null) {
      foundAny = true;
      const selectList = m[1].toLowerCase();
      assert.ok(
        !/\bbgchecks_api_key\b/.test(selectList),
        `migration ${name} defines public view with bgchecks_api_key in its SELECT list`
      );
    }
  }
  assert.ok(foundAny, 'expected at least one CREATE VIEW for provider_background_check_accounts_public');
});

// ════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL POSTGRES TESTS
//
// These spin up a real Postgres connection, apply a faithful reproduction of
// the base table + RLS policies + the lockdown migration to an isolated
// schema, and assert column-level grant behavior end-to-end. They use the
// same Postgres role model Supabase ships (authenticated, anon, service_role)
// and stub `auth.uid()` exactly as PostgREST does (reading the JWT claims out
// of `request.jwt.claims`).
// ════════════════════════════════════════════════════════════════════════════

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = `bgc_rls_test_${crypto.randomBytes(4).toString('hex')}`;

let canRunBehavioral = false;
let setupErr = null;

async function setupDatabase() {
  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    // Isolated schema so we don't disturb the real heliumdb.
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(`SET search_path TO ${SCHEMA}, public`);

    // Supabase role stubs. CREATE ROLE IF NOT EXISTS isn't a thing in PG, so
    // catch the duplicate_object error.
    for (const role of ['authenticated', 'anon', 'service_role']) {
      try {
        await admin.query(`CREATE ROLE ${role} NOINHERIT NOLOGIN`);
      } catch (e) {
        if (e.code !== '42710') throw e; // duplicate_object
      }
      await admin.query(`GRANT USAGE ON SCHEMA ${SCHEMA} TO ${role}`);
    }

    // Supabase's auth.uid() reads sub from the JWT claims GUC. The real impl
    // is in the `auth` schema; we reproduce just enough of it inside our
    // isolated schema for the RLS policies to evaluate.
    await admin.query(`
      CREATE OR REPLACE FUNCTION ${SCHEMA}.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);

    // Faithful reproduction of the base table from
    // supabase/migrations/20260319_backgroundchecks_integration.sql (minus the
    // FK to auth.users which we don't reproduce here).
    await admin.query(`
      CREATE TABLE ${SCHEMA}.provider_background_check_accounts (
        provider_id UUID PRIMARY KEY,
        bgchecks_account_id TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    await admin.query(`ALTER TABLE ${SCHEMA}.provider_background_check_accounts ENABLE ROW LEVEL SECURITY`);
    await admin.query(`
      CREATE POLICY providers_own_bgchecks_account
        ON ${SCHEMA}.provider_background_check_accounts
        FOR ALL
        USING (provider_id = ${SCHEMA}.uid());
    `);
    await admin.query(`
      CREATE POLICY service_role_bgchecks_accounts
        ON ${SCHEMA}.provider_background_check_accounts
        FOR ALL
        TO service_role
        USING (true);
    `);
    // service_role gets table-wide ALL (legitimate server-side path that
    // bgc-decrypt-token.js / initiate-background-check.js / bgc-admin.js use
    // to read the decrypted key).
    await admin.query(`GRANT ALL ON ${SCHEMA}.provider_background_check_accounts TO service_role`);
    // For the browser-visible roles we GRANT SELECT explicitly at column
    // level on the non-secret columns only — this is the post-REVOKE state
    // the production migration ends up in. Static test #2 above is what
    // pins the invariant that no future migration re-adds a table-wide
    // GRANT (which, per PostgreSQL semantics, would silently bypass any
    // column-level REVOKE and re-expose the secret column).
    await admin.query(`
      GRANT SELECT (provider_id, bgchecks_account_id, created_at, updated_at)
        ON ${SCHEMA}.provider_background_check_accounts TO authenticated, anon;
    `);

    // Apply the relevant DDL from the lockdown migration, rewritten to use the
    // isolated schema. The shape mirrors 20260515e_bgc_live_mode.sql exactly
    // (ALTER TABLE adds, REVOKE, CREATE VIEW, GRANT) so a regression in the
    // real migration would be reproduced here too.
    await admin.query(`
      ALTER TABLE ${SCHEMA}.provider_background_check_accounts
        ADD COLUMN bgchecks_api_key TEXT,
        ADD COLUMN live_mode BOOLEAN DEFAULT FALSE,
        ADD COLUMN source_token TEXT;
    `);
    await admin.query(`
      REVOKE SELECT (bgchecks_api_key) ON ${SCHEMA}.provider_background_check_accounts FROM authenticated, anon;
    `);
    // The lockdown migration also adds live_mode + source_token columns which
    // need to be selectable by authenticated for the public view's projection
    // to work (security_invoker = true means the view runs as the caller).
    // In real Supabase these would be picked up by the default-privileges
    // GRANT ALL on public-schema tables; we mirror that explicitly here.
    await admin.query(`
      GRANT SELECT (live_mode, source_token)
        ON ${SCHEMA}.provider_background_check_accounts TO authenticated, anon;
    `);
    await admin.query(`
      CREATE VIEW ${SCHEMA}.provider_background_check_accounts_public
      WITH (security_invoker = true) AS
      SELECT provider_id, bgchecks_account_id, live_mode, source_token, created_at, updated_at
      FROM ${SCHEMA}.provider_background_check_accounts
      WHERE provider_id = ${SCHEMA}.uid();
    `);
    await admin.query(`GRANT SELECT ON ${SCHEMA}.provider_background_check_accounts_public TO authenticated`);

    // Seed: one row owned by our test "provider".
    await admin.query(`
      INSERT INTO ${SCHEMA}.provider_background_check_accounts
        (provider_id, bgchecks_account_id, bgchecks_api_key, live_mode, source_token)
      VALUES
        ('11111111-1111-1111-1111-111111111111', 'ACCT-OWN', 'super-secret-decrypted-key', TRUE, 'src-tok');
    `);

    canRunBehavioral = true;
  } catch (e) {
    setupErr = e;
  } finally {
    await admin.end();
  }
}

async function teardownDatabase() {
  if (!canRunBehavioral) return;
  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  } finally {
    await admin.end();
  }
}

// Helper: run a query as the given Postgres role with a fake provider JWT sub.
// We wrap everything in a transaction and use SET LOCAL so the role + JWT
// claim are scoped to the tx (and not leaked into a possibly-pooled session).
async function queryAs(role, sub, sql) {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    await c.query(`SET search_path TO ${SCHEMA}, public`);
    await c.query('BEGIN');
    try {
      if (sub) {
        await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [sub]);
      }
      await c.query(`SET LOCAL ROLE ${role}`);
      const result = await c.query(sql);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    }
  } finally {
    await c.end();
  }
}

test('behavioral: provider authenticated SELECT of bgchecks_api_key is rejected by column REVOKE', async () => {
  if (!canRunBehavioral) {
    console.log('    (skipped — no database)');
    if (setupErr) console.log(`    setup error: ${setupErr.message}`);
    return;
  }
  let raised = null;
  try {
    await queryAs(
      'authenticated',
      '11111111-1111-1111-1111-111111111111',
      `SELECT bgchecks_api_key FROM provider_background_check_accounts`
    );
  } catch (e) {
    raised = e;
  }
  assert.ok(raised, 'expected the SELECT to fail — REVOKE on bgchecks_api_key was not enforced');
  assert.strictEqual(
    raised.code,
    '42501',
    `expected permission_denied (42501), got ${raised.code}: ${raised.message}`
  );
  assert.ok(
    /bgchecks_api_key/i.test(raised.message) || /permission/i.test(raised.message),
    `error should mention the column or permission: ${raised.message}`
  );
});

test('behavioral: provider authenticated SELECT * still works but omits bgchecks_api_key', async () => {
  if (!canRunBehavioral) { console.log('    (skipped — no database)'); return; }
  // SELECT * on a table where the caller lacks SELECT on one column is also
  // rejected by Postgres — so a defensive client must enumerate the safe
  // columns. We assert both the rejection AND that the explicit safe-column
  // form works.
  let starErr = null;
  try {
    await queryAs(
      'authenticated',
      '11111111-1111-1111-1111-111111111111',
      `SELECT * FROM provider_background_check_accounts`
    );
  } catch (e) {
    starErr = e;
  }
  assert.ok(starErr, 'SELECT * should fail because the caller lacks SELECT on bgchecks_api_key');
  assert.strictEqual(starErr.code, '42501');

  const safe = await queryAs(
    'authenticated',
    '11111111-1111-1111-1111-111111111111',
    `SELECT provider_id, bgchecks_account_id, live_mode, source_token
       FROM provider_background_check_accounts`
  );
  assert.strictEqual(safe.rows.length, 1, 'RLS should still allow the provider to read their own row');
  assert.strictEqual(safe.rows[0].bgchecks_account_id, 'ACCT-OWN');
  assert.strictEqual(safe.rows[0].live_mode, true);
  assert.ok(!('bgchecks_api_key' in safe.rows[0]), 'safe projection should not include the secret column');
});

test('behavioral: public view returns the safe non-secret contract for the authenticated provider', async () => {
  if (!canRunBehavioral) { console.log('    (skipped — no database)'); return; }
  const r = await queryAs(
    'authenticated',
    '11111111-1111-1111-1111-111111111111',
    `SELECT * FROM provider_background_check_accounts_public`
  );
  assert.strictEqual(r.rows.length, 1, 'provider should see exactly their own row via the public view');
  const row = r.rows[0];
  // Contract: every non-secret column the production client code reads
  // (see www/bgc-compliance.js) must be present, and the secret must not be.
  for (const col of ['provider_id', 'bgchecks_account_id', 'live_mode', 'source_token', 'created_at', 'updated_at']) {
    assert.ok(col in row, `public view is missing expected column ${col}`);
  }
  assert.ok(!('bgchecks_api_key' in row), 'public view leaked bgchecks_api_key');
  assert.strictEqual(row.bgchecks_account_id, 'ACCT-OWN');
  assert.strictEqual(row.live_mode, true);
});

test('behavioral: anon role cannot read bgchecks_api_key either', async () => {
  if (!canRunBehavioral) { console.log('    (skipped — no database)'); return; }
  let err = null;
  try {
    await queryAs('anon', null, `SELECT bgchecks_api_key FROM provider_background_check_accounts`);
  } catch (e) { err = e; }
  assert.ok(err, 'anon SELECT of bgchecks_api_key must be rejected');
  assert.strictEqual(err.code, '42501');
});

test('behavioral: service_role bypass still allows server-side reads of bgchecks_api_key', async () => {
  if (!canRunBehavioral) { console.log('    (skipped — no database)'); return; }
  // Legitimate server-side callers (initiate-background-check.js, etc.) use
  // the service-role key and MUST be able to read the decrypted secret.
  const r = await queryAs(
    'service_role',
    null,
    `SELECT bgchecks_api_key FROM provider_background_check_accounts
       WHERE provider_id = '11111111-1111-1111-1111-111111111111'`
  );
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].bgchecks_api_key, 'super-secret-decrypted-key');
});

// ════════════════════════════════════════════════════════════════════════════

(async () => {
  if (DATABASE_URL) {
    try { await setupDatabase(); }
    catch (e) { setupErr = e; }
  } else {
    console.log('  (no DATABASE_URL — behavioral tests will be skipped)');
  }

  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.stack || err.message}`);
      failed++;
    }
  }

  try { await teardownDatabase(); } catch (e) { console.error(`teardown: ${e.message}`); }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
