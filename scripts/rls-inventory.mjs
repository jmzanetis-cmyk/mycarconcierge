#!/usr/bin/env node
/**
 * rls-inventory.mjs  —  READ-ONLY Row Level Security inventory
 * ===========================================================================
 * Answers, without modifying anything:
 *
 *   1. Which tables have RLS ENABLED vs DISABLED?
 *        (disabled + anon-reachable = exposed to anyone with the public key)
 *   2. What policies exist on each table? (RLS-on with a permissive policy
 *      like USING (true) is a false sense of security.)
 *   3. ANON REACHABILITY PROBE: with only the public anon key, which tables
 *      return rows? This is the bottom-line "what can a random visitor read"
 *      check — the thing that actually matters.
 *
 * SAFETY: 100% read-only. SELECTs only. Creates nothing, deletes nothing.
 * Safe to run against production. Uses the ANON key for the reachability
 * probe (to see what the public sees) and, IF a service-role key is also
 * provided, uses it to read pg_catalog for the authoritative RLS/policy list.
 *
 * USAGE
 *   SUPABASE_URL=... \
 *   SUPABASE_ANON_KEY=... \
 *   [SUPABASE_SERVICE_ROLE_KEY=...]   # optional, enables policy listing \
 *     node rls-inventory.mjs [--tables a,b,c] [--json]
 *
 * Without the service key, you still get the anon reachability probe (the most
 * important part). With it, you also get the authoritative RLS-enabled flags
 * and policy definitions from the catalog.
 * ===========================================================================
 */

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const JSON_OUT = args.includes('--json');
const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

if (!URL || !ANON) {
  console.error('ERROR: set SUPABASE_URL and SUPABASE_ANON_KEY (public key).');
  process.exit(2);
}

// Sensitive tables to probe by default. Override with --tables.
// These are the ones where a leak actually matters (PII, payments, messages).
const DEFAULT_TABLES = (getArg('--tables', '') || [
  'profiles', 'vehicles', 'maintenance_packages', 'bids', 'payments',
  'messages', 'ticket_messages', 'support_tickets', 'notifications',
  'member_founder_profiles', 'member_founder_applications', 'founder_payouts',
  'provider_applications', 'provider_reviews', 'disputes', 'households',
  'household_members', 'drivers', 'driver_locations', 'location_shares',
  'key_exchanges', 'bid_credit_purchases', 'service_history',
  'vehicle_service_history', 'emergency_requests', 'transport_tasks',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);

const anon = createClient(URL, ANON, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Probe 1 (always): what can the ANON key read? This is the real-world test.
// For each table, attempt an unauthenticated SELECT of up to 1 row.
//   - rows returned  → READABLE by the public (RLS off, or a policy that
//     allows anon SELECT). Flag loudly for PII tables.
//   - error (401/permission/RLS) → blocked. Good.
//   - empty array, no error → reachable but no rows visible to anon. Ambiguous
//     (could be RLS allowing only own-rows with no anon session, or empty table)
//     — reported as INCONCLUSIVE, lean safe but verify.
// ---------------------------------------------------------------------------
async function anonProbe(tables) {
  const out = [];
  for (const t of tables) {
    try {
      const { data, error } = await anon.from(t).select('*').limit(1);
      if (error) {
        out.push({ table: t, anon: 'BLOCKED', detail: error.message, severity: 'ok' });
      } else if (data && data.length > 0) {
        out.push({
          table: t, anon: 'READABLE', detail: `returned ${data.length} row to anon key`,
          sampleKeys: Object.keys(data[0]).slice(0, 8),
          severity: 'CRITICAL',
        });
      } else {
        out.push({
          table: t, anon: 'INCONCLUSIVE',
          detail: 'no error, 0 rows (RLS may allow only own-rows, or table empty)',
          severity: 'review',
        });
      }
    } catch (e) {
      out.push({ table: t, anon: 'ERROR', detail: e.message, severity: 'review' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Probe 2 (only with service key): authoritative RLS flags + policies from the
// catalog. Uses an RPC if present; otherwise tries a direct catalog select
// (works if you've exposed pg_catalog via a view — many projects haven't, in
// which case this gracefully reports "catalog not reachable, use dashboard").
// ---------------------------------------------------------------------------
async function catalogInventory(tables) {
  if (!SERVICE) return { available: false, reason: 'no service-role key provided' };
  const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // Try a SQL RPC the user may have (exec_sql / sql). If not present, we can't
  // read pg_catalog through PostgREST directly, and we say so honestly.
  const query = `
    select c.relname as table,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced,
           coalesce(json_agg(json_build_object(
             'policy', p.polname,
             'cmd', case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                      when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
             'permissive', p.polpermissive,
             'roles', (select array_agg(rolname) from pg_roles where oid = any(p.polroles)),
             'using', pg_get_expr(p.polqual, p.polrelid),
             'check', pg_get_expr(p.polwithcheck, p.polrelid)
           )) filter (where p.polname is not null), '[]') as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname = any($1)
    group by c.relname, c.relrowsecurity, c.relforcerowsecurity
    order by c.relname;`;

  for (const fn of ['exec_sql', 'sql', 'execute_sql']) {
    try {
      const { data, error } = await svc.rpc(fn, { query, params: [tables] }).single?.() ?? await svc.rpc(fn, { query });
      if (!error && data) return { available: true, via: fn, rows: data };
    } catch { /* try next */ }
  }
  return {
    available: false,
    reason:
      'no SQL-exec RPC found. Read RLS flags from the Supabase dashboard ' +
      '(Authentication → Policies), or create a read-only exec RPC. The anon ' +
      'probe below is the authoritative real-world check regardless.',
  };
}

// ---------------------------------------------------------------------------
const probe = await anonProbe(DEFAULT_TABLES);
const catalog = await catalogInventory(DEFAULT_TABLES);

if (JSON_OUT) {
  console.log(JSON.stringify({ probe, catalog }, null, 2));
} else {
  const L = [];
  const line = '─'.repeat(72);
  L.push(line); L.push('RLS INVENTORY  (read-only)'); L.push(line);

  const crit = probe.filter((p) => p.severity === 'CRITICAL');
  const review = probe.filter((p) => p.severity === 'review');
  const ok = probe.filter((p) => p.severity === 'ok');

  L.push(`Anon-key reachability probe across ${probe.length} sensitive tables:`);
  L.push(`  🔴 PUBLICLY READABLE: ${crit.length}   🟡 inconclusive: ${review.length}   🟢 blocked: ${ok.length}\n`);

  if (crit.length) {
    L.push(line);
    L.push('🔴 CRITICAL — readable with the PUBLIC anon key (anyone can read these):');
    for (const p of crit) {
      L.push(`  ${p.table}  —  ${p.detail}`);
      L.push(`      sample columns exposed: ${p.sampleKeys.join(', ')}`);
    }
    L.push('  → These tables leak data to any visitor. Fix RLS before launch.');
  }

  if (review.length) {
    L.push('\n' + line);
    L.push('🟡 INCONCLUSIVE — no rows to anon, but verify (could be empty table OR good RLS):');
    for (const p of review) L.push(`  ${p.table}  —  ${p.detail}`);
    L.push('  → Distinguish "empty table" from "RLS working" via the isolation test or dashboard.');
  }

  if (ok.length) {
    L.push('\n' + line);
    L.push('🟢 BLOCKED to anon (good):');
    L.push('  ' + ok.map((p) => p.table).join(', '));
  }

  L.push('\n' + line);
  L.push('CATALOG (RLS flags + policy definitions):');
  if (catalog.available) {
    L.push(`  (via ${catalog.via})`);
    L.push('  ' + JSON.stringify(catalog.rows, null, 2).split('\n').join('\n  '));
  } else {
    L.push('  Not available: ' + catalog.reason);
  }

  L.push('\n' + line);
  L.push('READING THIS:');
  L.push('  🔴 = a real leak. Anyone with your anon key (it ships in the browser)');
  L.push('       can read these rows. Highest priority.');
  L.push('  🟡 = ambiguous. An empty table looks the same as well-protected RLS');
  L.push('       through the anon probe. The isolation test (two real users)');
  L.push('       resolves these — but only run that supervised, against test users.');
  L.push('  🟢 = anon is blocked. Still worth confirming the policy is own-rows-only');
  L.push('       and not accidentally over-permissive for authenticated users.');
  L.push(line);
  console.log(L.join('\n'));
}
