'use strict';

// Task #425 (Step 3) + Task #289: cross-provider alert-dismissal lockdown.
//
// Three layers of verification:
//
//   (A) STATIC: the providers_dismiss_own_alerts policy in the latest
//       migration that defines it keeps `provider_id = auth.uid()` in BOTH
//       USING and WITH CHECK. A migration that loosens it fails this check.
//
//   (B) BEHAVIORAL: with a Supabase-shaped client wired to the same RLS
//       semantics, simulate Provider A trying to UPDATE an alert whose
//       provider_id belongs to Provider B. The update MUST return 0 rows
//       affected (RLS-filtered) instead of mutating Provider B's row.
//
//   (C) LIVE (Task #289): real Supabase roundtrip — service-role provisions
//       Provider A + B + alert rows, signs in as A, tries to dismiss B's
//       alert, asserts 0 rows affected. Skips when SUPABASE_ANON_KEY is not
//       a real JWT.
//
// Run:  node netlify/functions-tests/provider-alerts-rls.test.js

const fs   = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else { console.error('  FAIL', name, detail || ''); fail++; }
}

// (A) Static migration audit
const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
let lastDef = null;
let lastFile = null;
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
  const re = /CREATE POLICY\s+"providers_dismiss_own_alerts"[\s\S]*?(?=;)/gi;
  const matches = sql.match(re);
  if (matches) {
    lastDef = matches[matches.length - 1];
    lastFile = f;
  }
}
ok('providers_dismiss_own_alerts policy defined in some migration', !!lastDef);
ok('policy targets provider_alerts FOR UPDATE', /ON\s+provider_alerts\s+FOR\s+UPDATE/i.test(lastDef || ''));
ok('USING clause restricts to auth.uid()',     /USING\s*\(\s*provider_id\s*=\s*auth\.uid\(\)\s*\)/i.test(lastDef || ''));
ok('WITH CHECK clause restricts to auth.uid()', /WITH\s+CHECK\s*\(\s*provider_id\s*=\s*auth\.uid\(\)\s*\)/i.test(lastDef || ''));

let rlsEnabled = false;
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
  if (/ALTER TABLE\s+provider_alerts\s+ENABLE ROW LEVEL SECURITY/i.test(sql)) {
    rlsEnabled = true;
    break;
  }
}
ok('provider_alerts has ENABLE ROW LEVEL SECURITY', rlsEnabled);

// (B) Behavioral simulation
// We model the table + the policy in JS. The "client" carries the caller's
// uid (just like a real Supabase JWT would). `update().eq(...)` filters by
// the request's predicate AND the RLS USING clause; only matching rows are
// mutated. This is exactly what Postgres does under RLS.

function makeRlsClient(table, callerUid) {
  return {
    from(t) {
      if (t !== 'provider_alerts') throw new Error(`unexpected table ${t}`);
      const ctx = { _eqs: [], _action: null, _payload: null };
      const api = {
        update(payload) { ctx._action = 'update'; ctx._payload = payload; return api; },
        select() { ctx._action = ctx._action || 'select'; return api; },
        eq(col, val) { ctx._eqs.push([col, val]); return api; },
        async then(resolve) {
          // Apply the USING clause: provider_id = auth.uid()
          const visible = table.filter(r => r.provider_id === callerUid);
          // Then apply request predicates
          let rows = visible;
          for (const [col, val] of ctx._eqs) rows = rows.filter(r => r[col] === val);
          if (ctx._action === 'update') {
            // WITH CHECK: every resulting row must still satisfy
            // provider_id = auth.uid(). Reject any payload that would
            // violate it.
            if (Object.prototype.hasOwnProperty.call(ctx._payload, 'provider_id')
                && ctx._payload.provider_id !== callerUid) {
              return resolve({ data: [], error: { message: 'new row violates row-level security policy' } });
            }
            for (const r of rows) Object.assign(r, ctx._payload);
            return resolve({ data: rows.map(r => ({ ...r })), error: null });
          }
          return resolve({ data: rows.map(r => ({ ...r })), error: null });
        }
      };
      return api;
    }
  };
}

(async () => {
  const PROVIDER_A = '00000000-0000-0000-0000-00000000000A';
  const PROVIDER_B = '00000000-0000-0000-0000-00000000000B';
  const table = [
    { id: 'alert-1', provider_id: PROVIDER_A, is_dismissed: false, message: 'A alert' },
    { id: 'alert-2', provider_id: PROVIDER_B, is_dismissed: false, message: 'B alert' }
  ];

  const aClient = makeRlsClient(table, PROVIDER_A);

  // Provider A attempts to dismiss Provider B's alert by id.
  const { data: hostile } = await aClient
    .from('provider_alerts')
    .update({ is_dismissed: true })
    .eq('id', 'alert-2');

  ok('Provider A update against B\'s alert returns 0 rows', Array.isArray(hostile) && hostile.length === 0);

  const bRow = table.find(r => r.id === 'alert-2');
  ok('Provider B\'s alert remained is_dismissed=false', bRow && bRow.is_dismissed === false);

  // Provider A can dismiss their own alert.
  const { data: ownDismiss } = await aClient
    .from('provider_alerts')
    .update({ is_dismissed: true })
    .eq('id', 'alert-1');
  ok('Provider A can dismiss their own alert', Array.isArray(ownDismiss) && ownDismiss.length === 1 && ownDismiss[0].is_dismissed === true);

  // Provider A cannot reassign provider_id to themselves: in real Postgres
  // RLS, the USING clause filters B's row out before the UPDATE runs, so
  // the statement matches 0 rows (no error, no mutation). Belt-and-braces,
  // the WITH CHECK clause would also reject a forged payload.
  const { data: stealData } = await aClient
    .from('provider_alerts')
    .update({ provider_id: PROVIDER_A })
    .eq('id', 'alert-2');
  const bStill = table.find(r => r.id === 'alert-2');
  ok('Provider A cannot reassign B\'s alert (0 rows affected)', Array.isArray(stealData) && stealData.length === 0);
  ok('Provider B\'s alert provider_id unchanged after steal attempt', bStill && bStill.provider_id === PROVIDER_B);

  // ── (C) Live roundtrip (Task #289) ────────────────────────────────────────
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
  const isRealJwt = (k) => typeof k === 'string' && k.startsWith('eyJ') && k.length > 200;

  if (!SUPABASE_URL || !SERVICE_KEY || !isRealJwt(ANON_KEY)) {
    console.log('  ⚠ live roundtrip (C) skipped — SUPABASE_ANON_KEY is not a real JWT (set it to enable)');
  } else {
    const { createClient } = require('@supabase/supabase-js');
    const svc  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const anon = createClient(SUPABASE_URL, ANON_KEY,    { auth: { persistSession: false } });

    const tag  = Date.now();
    const emailA = `alerts-rls-a-${tag}@example.com`;
    const emailB = `alerts-rls-b-${tag}@example.com`;
    const pw = 'AlertRls1!Test';
    let uidA, uidB, alertAId, alertBId;

    try {
      // Provision Provider A
      const { data: cuA, error: errA } = await svc.auth.admin.createUser({
        email: emailA, password: pw, email_confirm: true
      });
      if (errA) throw new Error('createUser A: ' + errA.message);
      uidA = cuA.user.id;
      await svc.from('profiles').upsert({ id: uidA, email: emailA, role: 'provider' });

      // Provision Provider B
      const { data: cuB, error: errB } = await svc.auth.admin.createUser({
        email: emailB, password: pw, email_confirm: true
      });
      if (errB) throw new Error('createUser B: ' + errB.message);
      uidB = cuB.user.id;
      await svc.from('profiles').upsert({ id: uidB, email: emailB, role: 'provider' });

      // Insert alert rows via service role
      const { data: insA, error: insErrA } = await svc.from('provider_alerts')
        .insert({ provider_id: uidA, message: 'Alert for A', is_dismissed: false })
        .select('id').single();
      if (insErrA) throw new Error('insert alert A: ' + insErrA.message);
      alertAId = insA.id;

      const { data: insB, error: insErrB } = await svc.from('provider_alerts')
        .insert({ provider_id: uidB, message: 'Alert for B', is_dismissed: false })
        .select('id').single();
      if (insErrB) throw new Error('insert alert B: ' + insErrB.message);
      alertBId = insB.id;

      // Sign in as Provider A
      const { data: si, error: siErr } = await anon.auth.signInWithPassword({ email: emailA, password: pw });
      if (siErr) throw new Error('signIn A: ' + siErr.message);
      const authedA = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${si.session.access_token}` } }
      });

      // Provider A tries to dismiss Provider B's alert — must get 0 rows back.
      const { data: hostile, error: hostileErr } = await authedA
        .from('provider_alerts')
        .update({ is_dismissed: true })
        .eq('id', alertBId)
        .select();
      ok('live: Provider A update against B\'s alert → 0 rows (RLS filtered)',
        !hostileErr && Array.isArray(hostile) && hostile.length === 0,
        hostileErr ? hostileErr.message : `got ${hostile?.length} rows`);

      // Verify B's alert is still undismissed via service role.
      const { data: bCheck } = await svc.from('provider_alerts')
        .select('is_dismissed').eq('id', alertBId).single();
      ok('live: Provider B\'s alert remained is_dismissed=false after hostile update',
        bCheck && bCheck.is_dismissed === false,
        JSON.stringify(bCheck));

      // Provider A can dismiss their own alert.
      const { data: ownDis, error: ownErr } = await authedA
        .from('provider_alerts')
        .update({ is_dismissed: true })
        .eq('id', alertAId)
        .select();
      ok('live: Provider A can dismiss own alert (1 row updated)',
        !ownErr && Array.isArray(ownDis) && ownDis.length === 1 && ownDis[0].is_dismissed === true,
        ownErr ? ownErr.message : `got ${ownDis?.length} rows`);

    } catch (e) {
      console.error('  FAIL live roundtrip:', e.message);
      fail++;
    } finally {
      // Cleanup
      if (alertAId) await svc.from('provider_alerts').delete().eq('id', alertAId).catch(() => {});
      if (alertBId) await svc.from('provider_alerts').delete().eq('id', alertBId).catch(() => {});
      if (uidA) await svc.auth.admin.deleteUser(uidA).catch(() => {});
      if (uidB) await svc.auth.admin.deleteUser(uidB).catch(() => {});
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
