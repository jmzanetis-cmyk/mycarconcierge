// Stress test — Provider Shop / Merch Store checkout (Task #227)
//
// Validates concurrent /api/shop/products + /api/shop/checkout from sim
// members. Verifies:
//   1. Each successful checkout creates a unique merch_orders row.
//   2. No duplicate stripe_session_id rows (Stripe idempotency holds under
//      concurrent requests from the same member).
//   3. /api/shop/products handles burst public reads gracefully.
//
// Note: handleShopCheckout calls enforce2fa(); sim members may not have 2FA
// enabled, so most checkout attempts will return 403. The test treats 403/401
// as expected (recorded in statusCodes) and only fails on 5xx. Inventory
// integrity check verifies that any 200s did create unique orders.
//
// Endpoints under test:
//   GET  /api/shop/products  (server.js:39953)
//   POST /api/shop/checkout  (server.js:39958)
//
// Usage: node www/stress-test-shop-checkout.js
//        node www/stress-test-shop-checkout.js --concurrency=20 --duration=20

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const args = process.argv.slice(2);
function param(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? parseInt(f.split('=')[1], 10) : def;
}
function strParam(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? f.split('=').slice(1).join('=') : def;
}

const CONFIG = {
  concurrency:        param('concurrency', 30),
  duration:           param('duration', 30),
  rampUpTime:         param('ramp-up', 10),
  spikeMultiplier:    2,
  spikeDuration:      8,
  coolDownDuration:   8,
  coolDownConcurrency: 5,
  requestTimeout:     8000,
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};
const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const RESERVOIR_SIZE = 50000;
const STRESS_TAG = `stress-shop-${Date.now()}`;

function createMetric(name) {
  return {
    name, requests: 0, errors: 0, rateLimited: 0,
    latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0,
    statusCodes: {}
  };
}
const metrics = {
  products: createMetric('GET /api/shop/products'),
  checkout: createMetric('POST /api/shop/checkout'),
};

function addLatency(m, lat) {
  if (m.latencyCount < RESERVOIR_SIZE) {
    m.latencies[m.latencyCount] = lat;
  } else {
    const j = Math.floor(Math.random() * (m.latencyCount + 1));
    if (j < RESERVOIR_SIZE) m.latencies[j] = lat;
  }
  m.latencyCount++;
}
function recordMetric(m, lat, status) {
  m.requests++;
  addLatency(m, lat);
  m.statusCodes[status] = (m.statusCodes[status] || 0) + 1;
  if (status === 429) m.rateLimited++;
  // 4xx (incl. 401/403 from 2FA gate) is expected for sim users — only 5xx
  // (and timeouts) count as errors for this test.
  else if (status >= 500 || status === 0) m.errors++;
}
function recordCheckoutAuthOutcome(status) {
  // Sim users have no 2FA token configured. enforce2fa() MUST reject every
  // checkout with 401 or 403. A 200/201 here would mean the 2FA gate was
  // bypassed under load — count it as a security failure separate from 5xx.
  if (status === 401 || status === 403) {
    metrics.checkout.gateBlocked = (metrics.checkout.gateBlocked || 0) + 1;
  } else if (status === 200 || status === 201) {
    metrics.checkout.gateBypassed = (metrics.checkout.gateBypassed || 0) + 1;
  }
}
function getLatencies(m) {
  const len = Math.min(m.latencyCount, RESERVOIR_SIZE);
  return Array.from(m.latencies.subarray(0, len));
}
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, latency: Date.now() - start, body };
  } catch (err) {
    clearTimeout(timeout);
    return { status: 0, latency: Date.now() - start };
  }
}

async function getSession(email) {
  const c = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data } = await c.auth.signInWithPassword({ email, password: SIM_PASSWORD });
  return data?.session ? { token: data.session.access_token, userId: data.user.id } : null;
}

async function loadSimMembers() {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).filter(u =>
    u.email && u.email.endsWith(SIM_DOMAIN) && u.email.startsWith('sim-member-')
  ).slice(0, 10);
}

async function fetchProductCatalog() {
  const { status, body } = await timedFetch(`${BASE_URL}/api/shop/products`);
  if (status !== 200 || !body || !Array.isArray(body.products) || body.products.length === 0) {
    return null;
  }
  const p = body.products.find(p => p.variants && p.variants.length > 0);
  if (!p) return null;
  const v = p.variants[0];
  return {
    productId: p.id,
    variantId: v.id,
    printfulSyncVariantId: v.printfulSyncVariantId || v.id,
    name: p.name || 'Stress Product',
    variantName: v.name || 'Default',
    price: typeof v.price === 'number' ? v.price : 19.99,
  };
}

async function doProductsRead() {
  const { status, latency } = await timedFetch(`${BASE_URL}/api/shop/products`);
  recordMetric(metrics.products, latency, status);
}

async function doCheckout(member, sample) {
  const body = {
    items: [{
      productId: sample.productId,
      variantId: sample.variantId,
      printfulSyncVariantId: sample.printfulSyncVariantId,
      name: `[${STRESS_TAG}] ${sample.name}`,
      variantName: sample.variantName,
      price: sample.price,
      quantity: 1,
    }],
    shippingAddress: {
      line1: '123 Stress Test Ln',
      city: 'Newark',
      state: 'NJ',
      postal_code: '07102',
      country: 'US',
    },
  };
  const { status, latency } = await timedFetch(`${BASE_URL}/api/shop/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${member.token}`,
    },
    body: JSON.stringify(body),
  });
  recordMetric(metrics.checkout, latency, status);
  recordCheckoutAuthOutcome(status);
}

async function runPhase(name, concurrency, durationMs, members, sample) {
  const endTime = Date.now() + durationMs;
  let active = 0;
  await new Promise(resolve => {
    const tick = () => {
      while (active < concurrency && Date.now() < endTime) {
        active++;
        // 2/3 reads, 1/3 checkouts (real traffic mix). If no sample
        // catalog is available, all workers do reads.
        const op = (sample && Math.random() >= 0.66)
          ? doCheckout(pick(members), sample)
          : doProductsRead();
        op.then(() => {
          active--;
          if (Date.now() < endTime) tick();
          else if (active === 0) resolve();
        });
      }
      if (Date.now() >= endTime && active === 0) resolve();
    };
    tick();
  });
  console.log(`  [${name}] products: ${metrics.products.requests}, checkout: ${metrics.checkout.requests}`);
}

async function checkIntegrity() {
  const { data: orders } = await supabaseAdmin
    .from('merch_orders')
    .select('id, stripe_session_id, items, status, created_at')
    .gte('created_at', new Date(Date.now() - 600000).toISOString())
    .limit(2000);
  let stressOrders = 0;
  const sessionIds = new Set();
  let dupSessionIds = 0;
  for (const o of (orders || [])) {
    const items = Array.isArray(o.items) ? o.items : [];
    const isStress = items.some(it => it && typeof it.name === 'string' && it.name.includes(STRESS_TAG));
    if (isStress) {
      stressOrders++;
      if (o.stripe_session_id) {
        if (sessionIds.has(o.stripe_session_id)) dupSessionIds++;
        sessionIds.add(o.stripe_session_id);
      }
    }
  }
  return {
    stressOrders,
    uniqueSessionIds: sessionIds.size,
    dupSessionIds,
  };
}

async function cleanup() {
  const { data: orders } = await supabaseAdmin
    .from('merch_orders')
    .select('id, items')
    .gte('created_at', new Date(Date.now() - 600000).toISOString())
    .limit(2000);
  const ids = (orders || [])
    .filter(o => (Array.isArray(o.items) ? o.items : []).some(it => it && typeof it.name === 'string' && it.name.includes(STRESS_TAG)))
    .map(o => o.id);
  if (ids.length > 0) {
    await supabaseAdmin.from('merch_orders').delete().in('id', ids);
  }
}

function printResults(durationSec, integrity) {
  const productsArr = getLatencies(metrics.products);
  const checkoutArr = getLatencies(metrics.checkout);
  const pP95 = percentile(productsArr, 95);
  const cP95 = percentile(checkoutArr, 95);
  const totalReq = metrics.products.requests + metrics.checkout.requests;
  const totalErr = metrics.products.errors + metrics.checkout.errors;
  const errRate = totalReq > 0 ? (totalErr / totalReq) * 100 : 0;

  console.log('\n====================================================');
  console.log('  Shop Checkout — RESULTS');
  console.log('====================================================');
  console.log(`  Duration:        ${durationSec.toFixed(1)}s`);
  console.log(`  /products reqs:  ${metrics.products.requests}, p95=${pP95}ms`);
  console.log(`    statusCodes:   ${JSON.stringify(metrics.products.statusCodes)}`);
  console.log(`  /checkout reqs:  ${metrics.checkout.requests}, p95=${cP95}ms`);
  console.log(`    statusCodes:   ${JSON.stringify(metrics.checkout.statusCodes)}`);
  console.log(`  5xx error rate:  ${errRate.toFixed(2)}%`);
  const gateBlocked = metrics.checkout.gateBlocked || 0;
  const gateBypassed = metrics.checkout.gateBypassed || 0;
  console.log(`  Stress orders:   ${integrity.stressOrders}`);
  console.log(`  Unique sessions: ${integrity.uniqueSessionIds}`);
  console.log(`  Dup sessions:    ${integrity.dupSessionIds}`);
  console.log(`  2FA blocked:     ${gateBlocked} (401/403)`);
  console.log(`  2FA bypassed:    ${gateBypassed} (200/201 — security failure if > 0)`);

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));
  const criteria = [
    { name: 'p95 (/products) < 1500ms',  value: `${pP95}ms`,                pass: pP95 < 1500 },
    { name: 'p95 (/checkout) < 3000ms',  value: `${cP95}ms`,                pass: cP95 < 3000 },
    { name: '5xx rate < 2%',             value: `${errRate.toFixed(2)}%`,    pass: errRate < 2 },
    { name: 'No duplicate session IDs',  value: `${integrity.dupSessionIds}`, pass: integrity.dupSessionIds === 0 },
    { name: '2FA gate not bypassed',     value: `${gateBypassed} bypass(es)`, pass: gateBypassed === 0 },
  ];
  for (const c of criteria) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(36)} ${c.value}`);
  }
  console.log('\n====================================================\n');
  return criteria;
}

async function main() {
  console.log('\n====================================================');
  console.log('  MCC — Shop Checkout Stress Test');
  console.log('====================================================');
  console.log(`  Target:        ${BASE_URL}`);
  console.log(`  Concurrency:   ${CONFIG.concurrency}`);
  console.log(`  Duration:      ${CONFIG.duration}s`);
  console.log(`  Spike:         ${CONFIG.spikeMultiplier}x for ${CONFIG.spikeDuration}s`);
  console.log('====================================================\n');

  let exitCode = 1;
  try {
    console.log('[Setup] Loading sim members...');
    const memberUsers = await loadSimMembers();
    const sessions = [];
    for (const u of memberUsers) {
      const s = await getSession(u.email);
      if (s) sessions.push(s);
    }
    if (sessions.length === 0) {
      console.error('  No authenticated sim members.');
      process.exit(1);
    }
    console.log(`  Authenticated ${sessions.length} sim members`);

    console.log('[Setup] Fetching product catalog...');
    const sample = await fetchProductCatalog();
    if (!sample) {
      console.warn('  [WARN] No products available — checkout phase skipped (only /products will be exercised).');
    } else {
      console.log(`  Will use product ${sample.productId} variant ${sample.variantId} for checkouts`);
    }

    const start = Date.now();
    console.log('\n[Phase 1/4] Ramp-up...');
    await runPhase('Ramp', Math.ceil(CONFIG.concurrency * 0.3), CONFIG.rampUpTime * 1000, sessions, sample);
    console.log('[Phase 2/4] Sustained...');
    await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000, sessions, sample);
    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000, sessions, sample);
    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, sessions, sample);
    const dur = (Date.now() - start) / 1000;

    await new Promise(r => setTimeout(r, 1500));

    console.log('\n[Integrity] Verifying merch_orders state...');
    const integrity = await checkIntegrity();
    const criteria = printResults(dur, integrity);
    exitCode = criteria.every(c => c.pass) ? 0 : 1;
  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack);
  } finally {
    console.log('[Cleanup] Removing stress orders...');
    await cleanup();
    process.exit(exitCode);
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });
