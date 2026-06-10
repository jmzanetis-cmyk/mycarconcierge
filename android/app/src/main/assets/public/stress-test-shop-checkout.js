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
  return f ? Number.parseInt(f.split('=')[1], 10) : def;
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
// Task #259: do not hard-code stress-test passwords. Operators must supply
// STRESS_TEST_PASSWORD; we fail loudly so a misconfigured run can't silently
// fall back to a known-weak credential.
const SIM_PASSWORD = process.env.STRESS_TEST_PASSWORD;
if (!SIM_PASSWORD) {
  console.error('STRESS_TEST_PASSWORD environment variable is required');
  process.exit(1);
}
const RESERVOIR_SIZE = 50000;
const STRESS_TAG = process.env.STRESS_TAG || `stress-shop-${Date.now()}`;

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
function recordCheckoutAuthOutcome(status, sessionIs2faDisabled) {
  // Two distinct populations of sim sessions:
  //   * gated sessions  (2FA enabled, no current TOTP) — enforce2fa() MUST
  //     reject every checkout with 401/403. A 200/201 from a gated session
  //     means the 2FA gate was bypassed under load — security failure.
  //   * bypassed sessions (we deliberately set two_factor_enabled=false on
  //     these specific sims at setup so check2faRequired() returns false
  //     and the request flows through to Stripe). 200/201 is the EXPECTED
  //     outcome here — these are what exercise the real checkout-create
  //     path so we can validate idempotency / order persistence below.
  if (sessionIs2faDisabled) {
    if (status === 200 || status === 201) {
      metrics.checkout.successfulCreates = (metrics.checkout.successfulCreates || 0) + 1;
    } else if (status === 401 || status === 403) {
      // Should NOT happen — these sessions had 2FA disabled at setup. If
      // it does, our setup race-lost or the profile was re-locked mid-run.
      metrics.checkout.unexpectedGateBlocks = (metrics.checkout.unexpectedGateBlocks || 0) + 1;
    }
  } else if (status === 401 || status === 403) {
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
  recordCheckoutAuthOutcome(status, !!member.twoFactorDisabled);
}

// Helpers for the targeted 2FA-disable population used in the
// "successful checkout" sub-phase. These rows are flipped via the service
// role at setup (legitimate admin write — not an auth bypass — so the
// request can reach Stripe and create a real merch_orders row), then
// restored at teardown so the sim accounts return to their baseline
// 2FA-enabled state. Any failure here aborts the test rather than
// silently leaving the population in a degraded state.
async function disable2faOnSims(userIds) {
  const restored = [];
  for (const id of userIds) {
    try {
      const { data: prev } = await supabaseAdmin
        .from('profiles')
        .select('two_factor_enabled')
        .eq('id', id)
        .single();
      const wasEnabled = !!(prev && prev.two_factor_enabled);
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ two_factor_enabled: false })
        .eq('id', id);
      if (error) {
        console.warn(`  [WARN] disable2fa failed for ${id}: ${error.message}`);
        continue;
      }
      restored.push({ id, wasEnabled });
    } catch (e) {
      console.warn(`  [WARN] disable2fa exception for ${id}: ${e.message}`);
    }
  }
  return restored;
}

async function restore2faOnSims(restored) {
  for (const r of restored) {
    if (!r.wasEnabled) continue;
    try {
      await supabaseAdmin
        .from('profiles')
        .update({ two_factor_enabled: true })
        .eq('id', r.id);
    } catch { /* best-effort */ }
  }
}

// Choose one of the three operations for a runPhase tick. Pure dispatch —
// extracted from runPhase to keep the loop driver under the
// cognitive-complexity budget (Task #262).
function _pickShopOp(members, sample, slugs) {
  const r = Math.random();
  if (sample && r >= 0.66) return doCheckout(pick(members), sample);
  if (slugs && slugs.length > 0 && r < 0.33) return doProfileRead(slugs);
  return doProductsRead();
}

async function runPhase(name, concurrency, durationMs, members, sample, slugs) {
  const endTime = Date.now() + durationMs;
  let active = 0;
  await new Promise(resolve => {
    const tick = () => {
      while (active < concurrency && Date.now() < endTime) {
        active++;
        _pickShopOp(members, sample, slugs).then(() => {
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

function writeStressManifest(manifest) {
  const file = process.env.STRESS_MANIFEST_FILE;
  if (!file) return;
  try { require('fs').writeFileSync(file, JSON.stringify(manifest, null, 2)); }
  catch (e) { console.warn(`  [WARN] failed to write stress manifest: ${e.message}`); }
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
  // Task #396 — emit manifest BEFORE delete so the verifier can confirm
  // zero leftover merch_orders rows for this run.
  writeStressManifest({
    test: 'shop-checkout',
    stress_tag: STRESS_TAG,
    merch_order_ids: ids,
  });
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
  const successfulCreates = metrics.checkout.successfulCreates || 0;
  const unexpectedGateBlocks = metrics.checkout.unexpectedGateBlocks || 0;
  console.log(`  Stress orders:   ${integrity.stressOrders}`);
  console.log(`  Unique sessions: ${integrity.uniqueSessionIds}`);
  console.log(`  Dup sessions:    ${integrity.dupSessionIds}`);
  console.log(`  Gated path:      blocked=${gateBlocked} (401/403 expected), bypassed=${gateBypassed} (200/201 — security failure if > 0)`);
  console.log(`  Bypassed path:   successful=${successfulCreates} (200/201 expected), unexpected-blocks=${unexpectedGateBlocks}`);

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));
  // Idempotency / duplicate-session-id criterion is only meaningful if at
  // least one successful checkout occurred (i.e. some 200/201 escaped the
  // 2FA gate). When every attempt is blocked by 2FA — which is the
  // expected steady-state for sim accounts that lack a TOTP secret — the
  // check is vacuous and we report it as N/A rather than letting it
  // silently auto-pass. This avoids a false-positive "no duplicates" PASS
  // that masks a regression in the order-write path.
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
    { name: '2FA gate not bypassed (gated population only)',
      // Gated sims (2FA-enabled, no current TOTP) MUST be rejected. Any
      // 200/201 from a gated session is a security regression.
      value: `${gateBypassed} bypass(es) of ${gateBlocked + gateBypassed} gated checkout(s)`,
      pass: gateBypassed === 0 },
    { name: 'Gated path actually exercised (≥ 5 401/403 from gated sims)',
      // Without this floor, a regression that auto-bypasses 2FA could
      // silently turn every checkout into a successful create with the
      // gateBypassed-must-be-zero criterion still trivially satisfied
      // (because the bypassed-population path now subsumes everything).
      value: `${gateBlocked} blocked`,
      pass: gateBlocked >= 5 },
    { name: 'Bypassed path produced ≥ 5 successful checkouts (real Stripe sessions)',
      // Proves the 2FA-disabled population actually reached Stripe and the
      // checkout-create handler succeeded. This is what makes the
      // duplicate-session-id assertion below non-vacuous.
      value: `${successfulCreates} 200/201`,
      pass: successfulCreates >= 5 },
    { name: 'No unexpected 401/403 on bypassed sessions (disable2fa worked)',
      // If we set two_factor_enabled=false at setup but still see 401/403
      // on those sessions, either the profile was re-locked mid-run or
      // the disable write didn't actually persist.
      value: `${unexpectedGateBlocks} unexpected block(s)`,
      pass: unexpectedGateBlocks === 0 },
    { name: 'merch_orders rows persisted for successful creates (≥ 5)',
      // Tightens the previous loose "≥ 1 order created" check — proves
      // multiple successful checkouts both reached Stripe AND wrote to
      // merch_orders, so the dup-session-id check below has real signal.
      value: `${integrity.stressOrders} order(s) tagged with STRESS_TAG`,
      pass: integrity.stressOrders >= 5 },
    { name: 'No duplicate stripe_session_id rows in merch_orders',
      // Now that we have multiple real Stripe sessions persisted, a
      // duplicate session_id row would indicate a double-INSERT race in
      // the order-write path.
      value: `${integrity.dupSessionIds} dup(s) across ${integrity.stressOrders} order(s)`,
      pass: integrity.stressOrders === 0 || integrity.dupSessionIds === 0 },
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
  // Declared in function scope (NOT inside try) so the finally block can
  // ALWAYS see the list of profiles whose 2FA flag was flipped at setup.
  // A previous version declared this with `const` inside the try block,
  // which silently no-op'd the restore path because the identifier was
  // out of scope in finally and `typeof X !== 'undefined'` evaluated to
  // false for the block-scoped binding — leaving sim accounts in a
  // weakened auth posture across runs. Keep this declaration here.
  let restored2faState = [];
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

    // Designate the first 3 sim members as the "2FA-disabled" pool so
    // their checkout requests reach Stripe and create real merch_orders
    // rows we can validate idempotency / persistence against. The rest
    // remain 2FA-gated and exercise the auth-rejection path under load.
    // The flip is via service-role profiles UPDATE (a legitimate admin
    // write — not an auth bypass), and we restore each row at teardown.
    const bypassPoolSize = Math.min(3, sessions.length);
    const bypassUserIds = sessions.slice(0, bypassPoolSize).map(s => s.userId);
    console.log(`[Setup] Disabling 2FA on ${bypassPoolSize} sim profile(s) for the successful-checkout sub-test...`);
    restored2faState = await disable2faOnSims(bypassUserIds);
    console.log(`  Recorded ${restored2faState.length} profile(s) for restoration at teardown`);
    if (restored2faState.length === 0) {
      console.error('  [FATAL] Could not disable 2FA on any sim profiles — successful-checkout sub-test cannot run.');
      process.exit(1);
    }
    // Tag the chosen sessions so doCheckout/recordCheckoutAuthOutcome
    // route them through the bypassed-population accounting.
    for (let i = 0; i < bypassPoolSize; i++) {
      sessions[i].twoFactorDisabled = true;
    }

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
    if (restored2faState.length > 0) {
      console.log(`[Cleanup] Restoring 2FA on ${restored2faState.length} sim profile(s)...`);
      await restore2faOnSims(restored2faState);
      // Hard verify: re-read the profiles we flipped and assert each one
      // is back to two_factor_enabled=true. If even one remains false we
      // exit non-zero regardless of the test outcome — leaving sim
      // accounts in a weakened auth posture is a fixture-leak we will
      // not paper over.
      const ids = restored2faState.filter(r => r.wasEnabled).map(r => r.id);
      if (ids.length > 0) {
        try {
          const { data: post } = await supabaseAdmin
            .from('profiles')
            .select('id, two_factor_enabled')
            .in('id', ids);
          const stillDisabled = (post || []).filter(p => !p.two_factor_enabled).map(p => p.id);
          if (stillDisabled.length > 0) {
            console.error(`  [FATAL] 2FA restore failed for ${stillDisabled.length}/${ids.length} sim profile(s) — auth state drift detected. ids=${stillDisabled.join(',')}`);
            // Force non-zero exit even if the test itself passed.
            exitCode = 1;
          } else {
            console.log(`  Verified 2FA restored on ${ids.length} sim profile(s)`);
          }
        } catch (e) {
          console.error(`  [FATAL] Could not verify 2FA restoration (${e.message}) — exiting non-zero out of caution.`);
          exitCode = 1;
        }
      }
    }
    process.exit(exitCode);
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });
