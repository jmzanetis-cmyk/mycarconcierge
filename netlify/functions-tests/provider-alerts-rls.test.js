'use strict';

// Task #425 (Step 3): cross-provider alert-dismissal lockdown.
//
// Two layers of verification:
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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
