#!/usr/bin/env node
/**
 * MCC Member App — Backend Smoke Test
 *
 * READ-ONLY. Hits live production using the demo account.
 * No writes, no Stripe calls, no SMS/email, no data deletion.
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *
 * Required env (populate in .env before running):
 *   SUPABASE_URL      — project URL
 *   SUPABASE_ANON_KEY — anon/public key
 *   MCC_APP_URL       — e.g. https://mycarconcierge.com
 *   DEMO_EMAIL        — demo account email
 *   DEMO_PASSWORD     — demo account password (never commit)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Load .env (best-effort — no hard dependency on dotenv)
// ---------------------------------------------------------------------------
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '..', '.env');
try {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && val && !process.env[key]) process.env[key] = val;
  }
} catch {
  // .env absent — rely on environment already being set
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'MCC_APP_URL', 'DEMO_EMAIL', 'DEMO_PASSWORD'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`\n[FATAL] Missing required env vars: ${missing.join(', ')}`);
  console.error('Populate them in .env (copy from .env.example) and try again.\n');
  process.exit(1);
}

const SUPABASE_URL  = process.env.SUPABASE_URL;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;
const BASE_URL      = process.env.MCC_APP_URL.replace(/\/$/, '');
const DEMO_EMAIL    = process.env.DEMO_EMAIL;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const issues = [];

function pass(label) {
  console.log(`  ✓ PASS  ${label}`);
  passed++;
}

function fail(label, reason) {
  console.log(`  ✗ FAIL  ${label}`);
  console.log(`         → ${reason}`);
  failed++;
  issues.push({ label, reason });
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

async function apiGet(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, ok: res.ok, body };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║        MCC Member App — Backend Smoke Test                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`  Target : ${BASE_URL}`);
console.log(`  Account: ${DEMO_EMAIL}`);
console.log(`  Time   : ${new Date().toISOString()}`);

const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

// ── Check 1: Auth ──────────────────────────────────────────────────────────
section('Check 1 — Auth (Supabase signInWithPassword)');

const { data: authData, error: authErr } =
  await sb.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

if (authErr || !authData?.session) {
  fail('login returns valid session', authErr?.message || 'no session returned');
  console.error('\n[FATAL] Cannot authenticate — all subsequent checks will fail.\n');
  console.error('Verify DEMO_EMAIL and DEMO_PASSWORD in .env, then retry.\n');
  process.exit(1);
}

const session = authData.session;
const user    = authData.user;
const token   = session.access_token;

pass('login returns valid session');

if (token && typeof token === 'string' && token.length > 20) {
  pass('access_token is present and non-trivial');
} else {
  fail('access_token is present and non-trivial', `token length=${token?.length}`);
}

// Quick sanity: token works on an authed call (using it for the next check)
const meCheck = await apiGet('/api/me/feature-flags', token);
if (meCheck.ok) {
  pass('access_token accepted by authed endpoint (/api/me/feature-flags)');
} else {
  fail('access_token accepted by authed endpoint', `HTTP ${meCheck.status}`);
}

const uid = user.id;

// ── Check 2: Profile ───────────────────────────────────────────────────────
section('Check 2 — Profile (profiles table)');

const { data: profile, error: profileErr } =
  await sb.from('profiles').select('*').eq('id', uid).single();

if (profileErr || !profile) {
  fail('profiles row returned', profileErr?.message || 'no row');
} else {
  pass('profiles row returned');
  const hasZip   = 'zip_code' in profile;
  const hasCity  = 'city'     in profile;
  const hasState = 'state'    in profile;
  if (hasZip && hasCity && hasState) {
    pass('profile has zip_code, city, state fields');
  } else {
    const absent = ['zip_code','city','state'].filter(f => !(f in profile));
    fail('profile has zip_code, city, state fields', `missing: ${absent.join(', ')}`);
  }
}

// ── Check 3: Vehicles ──────────────────────────────────────────────────────
section('Check 3 — Vehicles (vehicles table)');

const { data: vehicles, error: vErr } =
  await sb.from('vehicles').select('*').eq('owner_id', uid).order('created_at', { ascending: false });

if (vErr) {
  fail('vehicles query succeeds', vErr.message);
} else {
  pass('vehicles query succeeds');
  if (vehicles.length >= 1) {
    pass(`at least one vehicle on record (found ${vehicles.length})`);
  } else {
    fail('at least one vehicle on record', 'query returned empty array — seed data missing?');
  }
  const camry = vehicles.find(v => v.make?.toLowerCase() === 'toyota');
  if (camry) {
    pass(`seeded Toyota present (${camry.year ?? ''} ${camry.make} ${camry.model ?? ''})`);
  } else {
    fail('seeded Toyota present', `makes found: [${vehicles.map(v => v.make).join(', ')}]`);
  }
}

// ── Check 4: Packages ──────────────────────────────────────────────────────
section('Check 4 — Packages / Service Requests (maintenance_packages table)');

const { data: packages, error: pkgErr } =
  await sb.from('maintenance_packages').select('id, title, status, created_at')
    .eq('member_id', uid).order('created_at', { ascending: false });

if (pkgErr) {
  fail('packages query succeeds', pkgErr.message);
} else {
  pass(`packages query succeeds (${packages.length} record${packages.length !== 1 ? 's' : ''})`);
  // Empty is fine — demo account may not have active requests
}

// ── Check 5: Providers directory ───────────────────────────────────────────
section('Check 5 — Providers directory (GET /api/directory/providers)');

const provRes = await apiGet('/api/directory/providers', token);

if (!provRes.ok) {
  fail('GET /api/directory/providers returns 2xx', `HTTP ${provRes.status}`);
} else {
  pass(`GET /api/directory/providers returns 2xx (${provRes.status})`);
  // Response is paginated: { providers, total, page, limit }
  // Directory filters to directory_opt_in=true + approved + not suspended.
  // Only live onboarded providers appear — threshold is ≥ 1, not seeded count.
  const list  = provRes.body?.providers ?? (Array.isArray(provRes.body) ? provRes.body : []);
  const total = provRes.body?.total ?? list.length;
  if (list.length >= 1) {
    pass(`provider list has ≥ 1 entry (${list.length} on page, ${total} total)`);
  } else {
    fail('provider list has ≥ 1 entry', 'zero results — all providers may be suspended or opted out');
  }
}

// ── Check 6: Concierge ─────────────────────────────────────────────────────
section('Check 6 — Concierge jobs (GET /api/concierge?role=member)');

const concRes = await apiGet('/api/concierge?role=member', token);

if (!concRes.ok) {
  fail('GET /api/concierge?role=member returns 2xx', `HTTP ${concRes.status}`);
} else {
  pass(`GET /api/concierge?role=member returns 2xx (${concRes.status})`);
  const jobs = Array.isArray(concRes.body)
    ? concRes.body
    : (concRes.body?.jobs ?? concRes.body?.data ?? []);
  pass(`response is array-shaped (${jobs.length} job${jobs.length !== 1 ? 's' : ''} — empty OK)`);
}

// ── Check 7: Notification preferences ─────────────────────────────────────
section('Check 7 — Notification prefs (Supabase client, direct table query)');

console.log('  ⚠  NOTE: /api/member/{id}/notification-preferences has NO _redirects rule.');
console.log('     The HTTP path used by Settings page (members-settings.js lines 82 & 128)');
console.log('     would 404 in production — this is a LIVE BUG. Fix: add the redirect rule.');
console.log('     Testing via Supabase client directly as an approved workaround.\n');

const { data: notifPrefs, error: notifErr } =
  await sb.from('member_notification_preferences').select('*').eq('member_id', uid);

if (notifErr) {
  fail('member_notification_preferences query succeeds', notifErr.message);
} else {
  pass('member_notification_preferences query succeeds (Supabase client)');
  if (notifPrefs.length >= 1) {
    pass('notification prefs row exists for demo member');
  } else {
    pass('notification prefs row absent — defaults will be used (acceptable)');
  }
}

// ── Check 8: Referral code ─────────────────────────────────────────────────
section('Check 8 — Referral code (GET /api/member/{id}/referral-code)');

const refRes = await apiGet(`/api/member/${uid}/referral-code`, token);

if (!refRes.ok) {
  fail(`GET /api/member/{id}/referral-code returns 2xx`, `HTTP ${refRes.status}`);
} else {
  pass(`GET /api/member/{id}/referral-code returns 2xx (${refRes.status})`);
  const code = refRes.body?.code ?? refRes.body?.referral_code;
  if (code && typeof code === 'string' && code.startsWith('MCC')) {
    pass(`referral code starts with MCC (${code})`);
  } else {
    fail('referral code starts with MCC', `got: ${JSON.stringify(code)}`);
  }
}

// ── Check 9: Onboarding checklist ──────────────────────────────────────────
section('Check 9 — Onboarding (GET /api/member/onboarding)');

const onbRes = await apiGet('/api/member/onboarding', token);

if (!onbRes.ok) {
  fail('GET /api/member/onboarding returns 2xx', `HTTP ${onbRes.status}`);
} else {
  pass(`GET /api/member/onboarding returns 2xx (${onbRes.status})`);
  const checklist = onbRes.body?.checklist;
  if (checklist && typeof checklist === 'object') {
    pass('response contains checklist object');
  } else {
    fail('response contains checklist object', `body: ${JSON.stringify(onbRes.body)?.slice(0, 120)}`);
  }
}

// ── Check 10: Feature flags ────────────────────────────────────────────────
section('Check 10 — Feature flags (GET /api/me/feature-flags)');
// Already checked in auth warm-up — record the formal result here
if (meCheck.ok) {
  pass(`GET /api/me/feature-flags returns 2xx (${meCheck.status})`);
} else {
  fail('GET /api/me/feature-flags returns 2xx', `HTTP ${meCheck.status}`);
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log(`║  Results: ${passed} passed, ${failed} failed`.padEnd(63) + '║');
console.log('╚══════════════════════════════════════════════════════════════╝');

if (issues.length) {
  console.log('\nFailed checks:');
  for (const { label, reason } of issues) {
    console.log(`  ✗ ${label}`);
    console.log(`    ${reason}`);
  }
  console.log('');
}

await sb.auth.signOut();

process.exit(failed > 0 ? 1 : 0);
