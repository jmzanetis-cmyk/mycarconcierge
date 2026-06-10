#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// pressure-test-platform.js — Sequential load test across 5 production endpoints.
//
// Fires 50 sequential calls (10 per endpoint), measures avg / p95 / max / error
// rate, and flags any endpoint exceeding 3 s avg or 5 % error rate.
//
// Usage:
//   MCC_SITE_URL=https://www.mycarconcierge.com \
//     SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//     node scripts/pressure-test-platform.js
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL     = process.env.MCC_SITE_URL || 'https://www.mycarconcierge.com';
const CALLS_PER_EP = 10;

const MAX_AVG_MS    = 3000;
const MAX_ERROR_PCT = 5;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(2);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function httpGet(path, token) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${SITE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const ms = Date.now() - t0;
    return { ok: res.status < 500, status: res.status, ms };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, err: e.message };
  }
}

async function httpPost(path, body, token) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${SITE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    const ms = Date.now() - t0;
    return { ok: res.status < 500, status: res.status, ms };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, err: e.message };
  }
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg    = Math.round(samples.reduce((s, x) => s + x, 0) / samples.length);
  const p95    = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
  const max    = sorted[sorted.length - 1];
  return { avg, p95, max };
}

function bar(ms) {
  const blocks = Math.min(Math.round(ms / 100), 30);
  return '▓'.repeat(blocks);
}

(async () => {
  // Obtain a real auth token for authenticated endpoints
  const stamp = Date.now();
  const email = `pressure-${stamp}@mcc-test.invalid`;
  const PASS  = 'PressureTest123!';

  let token = null;
  let userId = null;

  {
    const { data } = await svc.auth.admin.createUser({
      email, password: PASS, email_confirm: true,
      user_metadata: { full_name: 'Pressure Test User' }
    });
    userId = data?.user?.id;
    if (userId) {
      const { data: s } = await svc.auth.signInWithPassword({ email, password: PASS });
      token = s?.session?.access_token;
    }
  }

  // ── Endpoint definitions ───────────────────────────────────────────────────
  const endpoints = [
    {
      name: 'GET /api/provider-referral/lookup/CHRIS',
      run: () => httpGet('/api/provider-referral/lookup/CHRIS')
    },
    {
      name: 'GET /api/transport/requests',
      run: () => httpGet('/api/transport/requests', token)
    },
    {
      name: 'GET /api/car-clubs',
      run: () => httpGet('/api/car-clubs', token)
    },
    {
      name: 'GET /api/auto-bid/settings',
      run: () => httpGet('/api/auto-bid/settings', token)
    },
    {
      name: 'POST /api/webhooks/stripe (sig check)',
      run: () => httpPost('/api/webhooks/stripe', { type: 'test' })
    }
  ];

  console.log(`\nPressure test: ${CALLS_PER_EP} calls × ${endpoints.length} endpoints = ${CALLS_PER_EP * endpoints.length} total requests`);
  console.log(`Thresholds: avg < ${MAX_AVG_MS}ms, error rate < ${MAX_ERROR_PCT}%`);
  console.log(`Target: ${SITE_URL}\n`);

  let overallFail = false;
  const summary = [];

  for (const ep of endpoints) {
    process.stdout.write(`  ${ep.name} … `);
    const latencies = [];
    let errors = 0;

    for (let i = 0; i < CALLS_PER_EP; i++) {
      const r = await ep.run();
      latencies.push(r.ms);
      if (!r.ok) errors++;
    }

    const { avg, p95, max } = stats(latencies);
    const errPct = (errors / CALLS_PER_EP) * 100;
    const flag = (avg > MAX_AVG_MS || errPct > MAX_ERROR_PCT) ? ' ⚠ FLAGGED' : '';
    if (flag) overallFail = true;

    const line = `avg=${avg}ms  p95=${p95}ms  max=${max}ms  err=${errPct.toFixed(0)}%${flag}`;
    console.log(line);
    console.log(`    ${bar(avg)} ${avg}ms`);
    summary.push({ name: ep.name, avg, p95, max, errPct, flagged: !!flag });
  }

  // Cleanup
  if (userId) await svc.auth.admin.deleteUser(userId);

  // ── Summary table ──────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('ENDPOINT                                          AVG    P95    MAX  ERR%');
  console.log('──────────────────────────────────────────────────────────────────────');
  for (const s of summary) {
    const flag = s.flagged ? ' ⚠' : '  ';
    const name = s.name.padEnd(49).slice(0, 49);
    console.log(`${flag} ${name} ${String(s.avg).padStart(5)}ms ${String(s.p95).padStart(5)}ms ${String(s.max).padStart(5)}ms ${s.errPct.toFixed(0).padStart(3)}%`);
  }
  console.log('══════════════════════════════════════════════════════');

  const flagged = summary.filter(s => s.flagged);
  if (flagged.length === 0) {
    console.log('All endpoints within thresholds. ✓');
  } else {
    console.log(`${flagged.length} endpoint(s) exceeded thresholds:`);
    flagged.forEach(s => console.log(`  ✗ ${s.name} (avg=${s.avg}ms, err=${s.errPct.toFixed(0)}%)`));
  }

  process.exit(overallFail ? 1 : 0);
})();
