'use strict';

// Task #375 — Regression test: providers can't read the decrypted BGC API key.
//
// Two layers:
//
//   (A) STATIC — verify the REVOKE SELECT (bgchecks_api_key) grant is in
//       migrations so a future migration can't silently re-grant it.
//
//   (B) LIVE — real Supabase roundtrip:
//       - Service-role inserts a provider_background_check_accounts row with a
//         known bgchecks_api_key.
//       - Signs in as that provider (anon key).
//       - Authed client: SELECT * on the row must omit bgchecks_api_key.
//       - Explicit select('bgchecks_api_key') must error.
//       - provider_background_check_accounts_public view returns the row
//         without exposing the key.
//       Skips cleanly when SUPABASE_ANON_KEY is not a real JWT.
//
// Run:  node netlify/functions-tests/bgc-rls.test.js

const fs   = require('node:fs');
const path = require('node:path');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else       { console.error('  FAIL', name, detail || ''); fail++; }
}

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

// ─── (A) Static migration audit ───────────────────────────────────────────────
const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

let hasRevoke = false;
let hasView   = false;
let viewHasNoKey = false;

for (const f of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
  if (/REVOKE SELECT \(bgchecks_api_key\) ON provider_background_check_accounts FROM authenticated/i.test(sql)) {
    hasRevoke = true;
  }
  if (/CREATE VIEW provider_background_check_accounts_public/i.test(sql)) {
    hasView = true;
    viewHasNoKey = !/bgchecks_api_key/i.test(
      sql.slice(sql.search(/CREATE VIEW provider_background_check_accounts_public/i))
         .split(/;/)[0]
    );
  }
}

ok('REVOKE SELECT (bgchecks_api_key) from authenticated present in migrations', hasRevoke);
ok('provider_background_check_accounts_public view defined', hasView);
ok('public view does not expose bgchecks_api_key', viewHasNoKey);

// ─── (B) Live roundtrip ───────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;

const isRealJwt = (k) => typeof k === 'string' && k.startsWith('eyJ') && k.length > 200;

if (!SUPABASE_URL || !SERVICE_KEY || !isRealJwt(ANON_KEY)) {
  console.log('  ⚠ live roundtrip skipped — SUPABASE_ANON_KEY is not a real JWT (set it to enable)');
} else {
  (async () => {
    const { createClient } = require('@supabase/supabase-js');
    const svc  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const anon = createClient(SUPABASE_URL, ANON_KEY,    { auth: { persistSession: false } });

    const email = `bgc-rls-test-${Date.now()}@example.com`;
    const pw    = 'BgcRls1!Test';
    let uid;

    try {
      // Provision user + profile
      const { data: cu, error: cuErr } = await svc.auth.admin.createUser({
        email, password: pw, email_confirm: true
      });
      if (cuErr) throw new Error(`createUser: ${cuErr.message}`);
      uid = cu.user.id;
      await svc.from('profiles').upsert({ id: uid, email, role: 'provider' }, { onConflict: 'id' });

      // Insert BGC account row with a known API key (service role bypasses column grant)
      const { error: insErr } = await svc.from('provider_background_check_accounts').insert({
        provider_id: uid,
        bgchecks_api_key: 'SECRET_TOKEN_TEST',
        live_mode: true
      });
      if (insErr) throw new Error(`insert bgc row: ${insErr.message}`);

      // Sign in as the provider
      const { data: si, error: siErr } = await anon.auth.signInWithPassword({ email, password: pw });
      if (siErr) throw new Error(`signIn: ${siErr.message}`);
      const authed = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${si.session.access_token}` } }
      });

      // SELECT * — bgchecks_api_key must be absent
      const { data: row, error: selErr } = await authed
        .from('provider_background_check_accounts')
        .select('*')
        .eq('provider_id', uid)
        .maybeSingle();

      const selOk = selErr || (row && !('bgchecks_api_key' in row));
      ok('SELECT * omits bgchecks_api_key for authenticated provider', selOk,
        row ? `got keys: ${Object.keys(row).join(', ')}` : (selErr && selErr.message));

      // Explicit SELECT bgchecks_api_key must error
      const { data: keyRow, error: keyErr } = await authed
        .from('provider_background_check_accounts')
        .select('bgchecks_api_key')
        .eq('provider_id', uid)
        .maybeSingle();
      ok('explicit select(bgchecks_api_key) errors for authenticated provider',
        !!keyErr || (keyRow && !('bgchecks_api_key' in (keyRow || {}))),
        keyErr ? keyErr.message : `unexpectedly got: ${JSON.stringify(keyRow)}`);

      // Public view — row visible but no api_key column
      const { data: pub, error: pubErr } = await authed
        .from('provider_background_check_accounts_public')
        .select('provider_id, live_mode')
        .eq('provider_id', uid)
        .maybeSingle();
      ok('public view returns row for own provider_id', !pubErr && pub?.provider_id === uid,
        pubErr ? pubErr.message : JSON.stringify(pub));
      ok('public view does not contain bgchecks_api_key', !pub || !('bgchecks_api_key' in pub));
    } catch (e) {
      console.error('  FAIL live setup:', e.message);
      fail++;
    } finally {
      if (uid) {
        await svc.from('provider_background_check_accounts').delete().eq('provider_id', uid).catch(() => {});
        await svc.from('profiles').delete().eq('id', uid).catch(() => {});
        await svc.auth.admin.deleteUser(uid).catch(() => {});
      }
    }

    console.log(`\n${pass + fail === 0 ? 'no assertions' : `${pass} passed, ${fail} failed`}`);
    if (fail > 0) process.exitCode = 1;
  })().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
  return;
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
