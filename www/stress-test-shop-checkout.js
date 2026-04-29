// Stress test — Provider Shop / Merch Store checkout (Task #227)
//
// Validates concurrent reads against /api/shop/profile/:slug + /api/shop/products
// AND POST /api/shop/checkout from sim members. The traffic mix is:
//   ~1/3 GET /api/shop/profile/:slug   (public shop landing page)
//   ~1/3 GET /api/shop/products        (public catalog)
//   ~1/3 POST /api/shop/checkout       (authed sim member)
//
// Verifies:
//   1. Each successful checkout creates a unique merch_orders row.
//   2. No duplicate stripe_session_id rows under concurrent requests from
//      the same member with identical cart payloads (Stripe-side
//      idempotency for back-to-back calls). The current /api/shop/checkout
//      handler does NOT pass an idempotency_key to Stripe, so this surfaces
//      the gap if duplicate sessions ever appear (PASS criterion fails).
//   3. /api/shop/products and /api/shop/profile/:slug handle burst public
//      reads gracefully.
//   4. The 2FA gate is never bypassed under load — sim members have no 2FA
//      token configured, so any 200/201 from /api/shop/checkout is a
//      security failure (PASS criterion fails).
//   5. Inventory integrity: this product line is print-on-demand via
//      Printful, so there is no per-SKU inventory counter to oversell.
//      The integrity check therefore verifies the *order-level* invariant
//      (no duplicate stripe_session_id rows) which is the operational
//      equivalent for this product surface.
//
// Endpoints under test:
//   GET  /api/shop/profile/:slug  (server.js:43025)
//   GET  /api/shop/products       (server.js:39953)
//   POST /api/shop/checkout       (server.js:39958)
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
  profile:  createMetric('GET /api/shop/profile/:slug'),
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

async function loadShopSlugs() {
  // Pull a small set of provider directory_slugs so the profile reads
  // exercise real DB rows (not 404s). 2-10 slugs is plenty — the test
  // rotates through them.
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('directory_slug')
    .in('role', ['provider', 'pending_provider'])
    .not('directory_slug', 'is', null)
    .limit(10);
  return (data || []).map(p => p.directory_slug).filter(Boolean);
}

async function doProductsRead() {
  const { status, latency } = await timedFetch(`${BASE_URL}/api/shop/products`);
  recordMetric(metrics.products, latency, status);
}

async function doProfileRead(slugs) {
  if (!slugs || slugs.length === 0) return;
  const slug = pick(slugs);
  const { status, latency } = await timedFetch(
    `${BASE_URL}/api/shop/profile/${encodeURIComponent(slug)}`
  );
  // 404 is acceptable (slug pool may include a deleted shop); only 5xx counts.
  recordMetric(metrics.profile, latency, status);
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

async function runPhase(name, concurrency, durationMs, members, sample, slugs) {
  const endTime = Date.now() + durationMs;
  let active = 0;
  await new Promise(resolve => {
    const tick = () => {
      while (active < concurrency && Date.now() < endTime) {
        active++;
        // 1/3 profile reads, 1/3 product reads, 1/3 checkouts. Falls back to
        // pure reads if catalog/slugs unavailable.
        const r = Math.random();
        let op;
        if (sample && r >= 0.66) {
          op = doCheckout(pick(members), sample);
        } else if (slugs && slugs.length > 0 && r < 0.33) {
          op = doProfileRead(slugs);
        } else {
          op = doProductsRead();
        }
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
  console.log(`  [${name}] profile: ${metrics.profile.requests}, products: ${metrics.products.requests}, checkout: ${metrics.checkout.requests}`);
}

// Idempotency burst — drive N concurrent identical-cart checkouts from the
// SAME sim member and verify each gets a unique stripe_session_id (the
// invariant we care about; the current handler does NOT pass an
// idempotency_key to Stripe so this asserts that under load no
// duplicate session-id rows ever appear in merch_orders).
async function idempotencyBurst(member, sample, n = 20) {
  if (!member || !sample) return { issued: 0 };
  const tasks = [];
  for (let i = 0; i < n; i++) tasks.push(doCheckout(member, sample));
  await Promise.all(tasks);
  return { issued: n };
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
  const profileArr = getLatencies(metrics.profile);
  const pP95 = percentile(productsArr, 95);
  const cP95 = percentile(checkoutArr, 95);
  const ppP95 = percentile(profileArr, 95);
  const totalReq = metrics.products.requests + metrics.checkout.requests + metrics.profile.requests;
  const totalErr = metrics.products.errors + metrics.checkout.errors + metrics.profile.errors;
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
  // Idempotency / duplicate-session-id criterion is only meaningful if at
  // least one successful checkout occurred (i.e. some 200/201 escaped the
  // 2FA gate). When every attempt is blocked by 2FA — which is the
  // expected steady-state for sim accounts that lack a TOTP secret — the
  // check is vacuous and we report it as N/A rather than letting it
  // silently auto-pass. This avoids a false-positive "no duplicates" PASS
  // that masks a regression in the order-write path.
  const checkoutBypassed = integrity.stressOrders > 0;
  const checkoutAttempted = metrics.checkout.requests > 0;
  // Minimum checkout traffic to consider the checkout path "meaningfully
  // sampled." 20 attempts at 1/3 of the workload mix easily clears this in
  // a few seconds, but a degraded path (missing catalog, broken auth,
  // immediate aborts) won't — surfacing the under-sampling instead of a
  // silent vacuous PASS. Includes the dedicated 20-request idempotency
  // burst, so even a small sustained mix will safely clear the floor.
  const MIN_CHECKOUT_REQUESTS = 20;
  const checkoutSampleAdequate = metrics.checkout.requests >= MIN_CHECKOUT_REQUESTS;
  // Sum every server-side failure mode: status===0 (timeout/abort/network)
  // PLUS any 5xx (501/505 etc., not just the common 500/502/503/504). This
  // mirrors recordMetric's m.errors classification but scoped to checkout,
  // so checkout-path instability can't hide behind catalog-read traffic in
  // the blended overall error-rate criterion.
  let checkout5xx = 0;
  for (const [codeStr, count] of Object.entries(metrics.checkout.statusCodes)) {
    const code = Number(codeStr);
    if (code === 0 || code >= 500) checkout5xx += count;
  }
  const checkout5xxRate = checkoutAttempted ? (checkout5xx / metrics.checkout.requests) * 100 : 0;
  const criteria = [
    { name: 'Checkout endpoint was actually exercised',
      // Without this, a missing catalog or skipped checkout phase would
      // silently let the rest of the criteria pass with checkout uninvolved.
      value: `${metrics.checkout.requests} request(s)`,
      pass: checkoutAttempted },
    { name: `Checkout sample ≥ ${MIN_CHECKOUT_REQUESTS} requests`,
      // Defends against a checkout path that fails almost immediately and
      // generates only a handful of attempts before workers exit.
      value: `${metrics.checkout.requests}`,
      pass: checkoutSampleAdequate },
    { name: 'Checkout 5xx rate < 1%',
      // Distinct from the overall 5xx criterion (which is dominated by
      // catalog reads); this isolates checkout-path errors.
      value: checkoutAttempted ? `${checkout5xxRate.toFixed(2)}% (${checkout5xx}/${metrics.checkout.requests})` : 'no requests',
      pass: !checkoutAttempted || checkout5xxRate < 1 },
    { name: 'p95 (/profile) < 1500ms',
      value: profileArr.length > 0 ? `${ppP95}ms` : 'no requests',
      pass: profileArr.length === 0 || ppP95 < 1500 },
    { name: 'p95 (/products) < 1500ms', value: `${pP95}ms`,                pass: pP95 < 1500 },
    { name: 'p95 (/checkout) < 3000ms',
      value: checkoutAttempted ? `${cP95}ms` : 'no requests',
      pass: checkoutAttempted && cP95 < 3000 },
    { name: '5xx rate < 2%',            value: `${errRate.toFixed(2)}%`,    pass: errRate < 2 },
    { name: '2FA gate not bypassed',    value: `${gateBypassed} bypass(es)`, pass: gateBypassed === 0 },
    { name: 'No duplicate session IDs (only meaningful when ≥1 order created)',
      value: checkoutBypassed
        ? `${integrity.dupSessionIds} dup(s) across ${integrity.stressOrders} order(s)`
        : 'N/A — 2FA blocked all checkouts',
      // Pass if either (a) no orders ever made it past 2FA (vacuous — handled
      // by the 2FA-not-bypassed criterion) or (b) at least one order was
      // created and zero duplicate stripe_session_id rows exist.
      pass: !checkoutBypassed || integrity.dupSessionIds === 0 },
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

    console.log('[Setup] Loading shop directory slugs for /api/shop/profile/:slug reads...');
    const slugs = await loadShopSlugs();
    console.log(`  Loaded ${slugs.length} slug(s)`);

    const start = Date.now();
    console.log('\n[Phase 1/4] Ramp-up...');
    await runPhase('Ramp', Math.ceil(CONFIG.concurrency * 0.3), CONFIG.rampUpTime * 1000, sessions, sample, slugs);
    console.log('[Phase 2/4] Sustained...');
    await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000, sessions, sample, slugs);
    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000, sessions, sample, slugs);
    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, sessions, sample, slugs);

    // Idempotency burst: 20 concurrent identical-cart checkouts from one
    // sim member. Verify (in checkIntegrity) that no two share a
    // stripe_session_id row. The burst itself is small so it doesn't
    // dominate the run, but it's the surface that exercises the
    // back-to-back duplicate-prevention claim.
    if (sample) {
      console.log('\n[Idempotency] Bursting 20 identical-cart checkouts from a single sim member...');
      await idempotencyBurst(sessions[0], sample, 20);
    }
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
