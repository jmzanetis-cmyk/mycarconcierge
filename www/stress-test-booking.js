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
  concurrency:        param('concurrency', 100),
  duration:           param('duration', 60),
  rampUpTime:         param('ramp-up', 30),
  spikeMultiplier:    2,
  spikeDuration:      10,
  coolDownDuration:   10,
  coolDownConcurrency: 10,
  requestTimeout:     5000,
  providerCount:      param('providers', 3),
  bayCapacity:        param('bay-capacity', 2),
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const RESERVOIR_SIZE = 50000;

const BOOKING_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
})();

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  availableSlots: createMetric('GET slots'),
  createBooking:  createMetric('POST book'),
  cancelBooking:  createMetric('POST cancel'),
  schedule:       createMetric('GET schedule'),
};

let workerUnhandledErrors = 0;
const bookingRegistry = [];

function addLatency(metric, latency) {
  if (metric.latencyCount < RESERVOIR_SIZE) {
    metric.latencies[metric.latencyCount] = latency;
  } else {
    const j = Math.floor(Math.random() * (metric.latencyCount + 1));
    if (j < RESERVOIR_SIZE) metric.latencies[j] = latency;
  }
  metric.latencyCount++;
}

function recordMetric(metric, latency, status, expectedReject) {
  metric.requests++;
  addLatency(metric, latency);
  metric.statusCodes[status] = (metric.statusCodes[status] || 0) + 1;
  if (status === 429) {
    metric.rateLimited++;
  } else if (expectedReject && status === 400) {
    // noop
  } else if (status >= 400 || status === 0) {
    metric.errors++;
  }
}

function getLatencies(metric) {
  const len = Math.min(metric.latencyCount, RESERVOIR_SIZE);
  return Array.from(metric.latencies.subarray(0, len));
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const latency = Date.now() - start;
    clearTimeout(timeout);
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, latency, ok: res.ok, body };
  } catch (err) {
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (err.name === 'AbortError') return { status: 0, latency, ok: false, timeout: true, body: null };
    return { status: 0, latency, ok: false, body: null };
  }
}

async function getSession(email) {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: SIM_PASSWORD });
  if (error || !data?.session) return null;
  return { token: data.session.access_token, userId: data.user.id };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const TIME_SLOTS = [];
for (let m = 480; m < 1020; m += 30) {
  TIME_SLOTS.push({ start: minutesToTime(m), end: minutesToTime(m + 30), startMin: m, endMin: m + 30 });
}

async function seedWorkingHours(providerIds, cleanupState) {
  const dayOfWeek = new Date(BOOKING_DATE + 'T00:00:00').getDay();
  console.log(`  Booking date: ${BOOKING_DATE} (day of week: ${dayOfWeek})`);
  console.log(`  Seeding working hours for ${providerIds.length} providers (bay capacity: ${CONFIG.bayCapacity})...`);

  const rows = providerIds.map(pid => ({
    provider_id: pid,
    day_of_week: dayOfWeek,
    start_time: '08:00',
    end_time: '17:00',
    is_active: true,
    bay_capacity: CONFIG.bayCapacity,
  }));

  const inserted = [];
  for (const row of rows) {
    const { data: existing } = await supabaseAdmin
      .from('provider_working_hours')
      .select('id, bay_capacity, start_time, end_time, is_active')
      .eq('provider_id', row.provider_id)
      .eq('day_of_week', row.day_of_week)
      .maybeSingle();

    if (existing) {
      cleanupState.originalWorkingHours.push({
        id: existing.id,
        providerId: row.provider_id,
        dayOfWeek: row.day_of_week,
        bayCapacity: existing.bay_capacity,
        startTime: existing.start_time,
        endTime: existing.end_time,
        isActive: existing.is_active,
      });
      await supabaseAdmin
        .from('provider_working_hours')
        .update({ start_time: '08:00', end_time: '17:00', is_active: true, bay_capacity: CONFIG.bayCapacity })
        .eq('id', existing.id);
      inserted.push(existing.id);
    } else {
      const { data, error } = await supabaseAdmin
        .from('provider_working_hours')
        .insert(row)
        .select('id')
        .single();
      if (error) {
        console.log(`  [WARN] Failed to insert working hours for ${row.provider_id}: ${error.message}`);
        continue;
      }
      cleanupState.createdWorkingHourIds.push(data.id);
      inserted.push(data.id);
    }
  }

  console.log(`  ${inserted.length} working hour rows ready`);
  return inserted;
}

async function loadSimData(cleanupState) {
  console.log('  Loading simulation data...');

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));

  const memberEmails = simUsers.filter(u => u.email.startsWith('sim-member-')).map(u => u.email).slice(0, 30);
  const providerEmails = simUsers.filter(u => u.email.startsWith('sim-provider-')).map(u => u.email).slice(0, CONFIG.providerCount);

  if (memberEmails.length === 0) {
    throw new Error('No simulation member accounts found. Run simulate-platform.js first.');
  }

  console.log(`  Found ${memberEmails.length} member accounts, ${providerEmails.length} provider accounts`);
  console.log('  Authenticating test users...');

  const memberSessions = [];
  const providerSessions = [];

  for (const email of memberEmails) {
    if (memberSessions.length >= 20) break;
    const session = await getSession(email);
    if (session) memberSessions.push(session);
  }

  for (const email of providerEmails) {
    const session = await getSession(email);
    if (session) providerSessions.push(session);
  }

  if (memberSessions.length === 0) {
    throw new Error('Could not authenticate any member accounts.');
  }
  if (providerSessions.length === 0) {
    throw new Error('Could not authenticate any provider accounts.');
  }

  console.log(`  Authenticated: ${memberSessions.length} members, ${providerSessions.length} providers`);

  const providerIds = providerSessions.map(s => s.userId);
  await seedWorkingHours(providerIds, cleanupState);

  const { data: staleBookings } = await supabaseAdmin
    .from('slot_bookings')
    .select('id')
    .eq('booking_date', BOOKING_DATE)
    .in('provider_id', providerIds);

  if (staleBookings && staleBookings.length > 0) {
    const staleIds = staleBookings.map(b => b.id);
    await supabaseAdmin.from('slot_bookings').delete().in('id', staleIds);
    console.log(`  Cleaned up ${staleIds.length} stale bookings for test date`);
  }

  return { memberSessions, providerSessions, providerIds };
}

async function runGetSlots(session, providerId) {
  const result = await timedFetch(`${BASE_URL}/api/provider/available-slots/${providerId}?date=${BOOKING_DATE}`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metrics.availableSlots.timeouts++;
    metrics.availableSlots.requests++;
    addLatency(metrics.availableSlots, result.latency);
    return;
  }
  recordMetric(metrics.availableSlots, result.latency, result.status);
}

async function runCreateBooking(session, providerId) {
  const slot = pick(TIME_SLOTS);
  const longer = rand(1, 3) === 1;
  const startTime = slot.start;
  const endTime = longer && slot.startMin + 60 <= 1020 ? minutesToTime(slot.startMin + 60) : slot.end;
  const duration = longer && slot.startMin + 60 <= 1020 ? 60 : 30;

  const result = await timedFetch(`${BASE_URL}/api/booking/create`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider_id: providerId,
      booking_date: BOOKING_DATE,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: duration,
      service_location: 'on_site',
      member_notes: 'Stress test booking',
    }),
  });

  if (result.timeout) {
    metrics.createBooking.timeouts++;
    metrics.createBooking.requests++;
    addLatency(metrics.createBooking, result.latency);
    return;
  }

  const isSlotFull = result.status === 400 && result.body?.error &&
    result.body.error.includes('No available bays');
  recordMetric(metrics.createBooking, result.latency, result.status, isSlotFull);

  if (result.status === 201 && result.body?.booking?.id) {
    bookingRegistry.push({
      bookingId: result.body.booking.id,
      memberId: session.userId,
      memberToken: session.token,
      providerId,
    });
  }
}

async function runCancelBooking() {
  if (bookingRegistry.length === 0) return;

  const entry = bookingRegistry[rand(0, bookingRegistry.length - 1)];

  const result = await timedFetch(`${BASE_URL}/api/booking/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${entry.memberToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      booking_id: entry.bookingId,
      cancel_reason: 'Stress test cancellation',
    }),
  });

  if (result.timeout) {
    metrics.cancelBooking.timeouts++;
    metrics.cancelBooking.requests++;
    addLatency(metrics.cancelBooking, result.latency);
    return;
  }

  const isAlreadyCancelled = result.status === 400 && result.body?.error?.includes('already cancelled');
  recordMetric(metrics.cancelBooking, result.latency, result.status, isAlreadyCancelled);
}

async function runGetSchedule(session, providerId) {
  const result = await timedFetch(`${BASE_URL}/api/provider/schedule/${providerId}`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metrics.schedule.timeouts++;
    metrics.schedule.requests++;
    addLatency(metrics.schedule, result.latency);
    return;
  }
  recordMetric(metrics.schedule, result.latency, result.status);
}

async function runBookingWorker(data, stopSignal) {
  const { memberSessions, providerSessions, providerIds } = data;
  const allSessions = [...memberSessions, ...providerSessions];

  while (!stopSignal.stop) {
    const action = rand(1, 10);
    try {
      if (action <= 3) {
        await runGetSlots(pick(allSessions), pick(providerIds));
      } else if (action <= 7) {
        await runCreateBooking(pick(memberSessions), pick(providerIds));
      } else {
        await runGetSchedule(pick(allSessions), pick(providerIds));
      }
    } catch (err) {
      workerUnhandledErrors++;
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

async function runCancelWorker(stopSignal) {
  while (!stopSignal.stop) {
    try {
      await runCancelBooking();
    } catch (err) {
      workerUnhandledErrors++;
    }
    await new Promise(r => setTimeout(r, 500 + rand(0, 500)));
  }
}

async function runPhase(name, concurrency, durationMs, data) {
  const startTime = Date.now();
  const stopSignal = { stop: false };

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runBookingWorker(data, stopSignal));
  }
  const cancelWorkerCount = Math.max(1, Math.floor(concurrency / 10));
  for (let i = 0; i < cancelWorkerCount; i++) {
    workers.push(runCancelWorker(stopSignal));
  }

  const interval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const total = Object.values(metrics).reduce((s, m) => s + m.requests, 0);
    process.stdout.write(`  [${name}] ${elapsed}s elapsed | ${total} total requests | ${concurrency}+${cancelWorkerCount} workers\r`);
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, durationMs));
  stopSignal.stop = true;
  await Promise.allSettled(workers);
  clearInterval(interval);

  const total = Object.values(metrics).reduce((s, m) => s + m.requests, 0);
  console.log(`  [${name}] Complete — ${total} total requests                                    `);
}

async function checkDoubleBookings(providerIds) {
  console.log('\n  DOUBLE-BOOKING INTEGRITY CHECK');
  console.log('  ------------------------------------------------------------');

  const { data: allBookings, error } = await supabaseAdmin
    .from('slot_bookings')
    .select('id, provider_id, booking_date, start_time, end_time, status, member_id')
    .eq('booking_date', BOOKING_DATE)
    .eq('status', 'booked')
    .in('provider_id', providerIds);

  if (error) {
    console.log(`  [WARN] Could not query slot_bookings: ${error.message}`);
    return { pass: false, overbooked: 0 };
  }

  const bookedRows = allBookings || [];
  console.log(`  Active bookings on ${BOOKING_DATE}: ${bookedRows.length}`);

  if (bookedRows.length === 0) {
    console.log('  [PASS] No active bookings — nothing to check');
    return { pass: true, overbooked: 0 };
  }

  const bookingDayOfWeek = new Date(BOOKING_DATE + 'T00:00:00').getDay();
  const { data: whRows } = await supabaseAdmin
    .from('provider_working_hours')
    .select('provider_id, bay_capacity, day_of_week')
    .in('provider_id', providerIds)
    .eq('day_of_week', bookingDayOfWeek);

  const capacityMap = {};
  for (const wh of (whRows || [])) {
    capacityMap[wh.provider_id] = wh.bay_capacity || 1;
  }

  let overbookedSlots = 0;
  const violations = [];

  for (const providerId of providerIds) {
    const provBookings = bookedRows.filter(b => b.provider_id === providerId);
    if (provBookings.length === 0) continue;

    const capacity = capacityMap[providerId] || 1;

    const allMinutes = new Set();
    for (const b of provBookings) {
      const parts = b.start_time.split(':');
      const startMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      const endParts = b.end_time.split(':');
      const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
      for (let m = startMin; m < endMin; m += 30) {
        allMinutes.add(m);
      }
    }

    for (const minute of allMinutes) {
      let overlapping = 0;
      for (const b of provBookings) {
        const parts = b.start_time.split(':');
        const bStart = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        const endParts = b.end_time.split(':');
        const bEnd = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        if (minute >= bStart && minute < bEnd) {
          overlapping++;
        }
      }
      if (overlapping > capacity) {
        overbookedSlots++;
        if (violations.length < 5) {
          violations.push({
            providerId,
            time: minutesToTime(minute),
            overlapping,
            capacity,
          });
        }
      }
    }
  }

  if (overbookedSlots === 0) {
    console.log(`  [PASS] No double-booking detected`);
  } else {
    console.log(`  [FAIL] DOUBLE-BOOKING detected: ${overbookedSlots} time slot(s) exceed bay capacity`);
    for (const v of violations) {
      console.log(`         Provider ${v.providerId} at ${v.time}: ${v.overlapping} bookings (capacity: ${v.capacity})`);
    }
  }

  return { pass: overbookedSlots === 0, overbooked: overbookedSlots };
}

function printResults(data, testDurationSec, integrityResult) {
  console.log('\n====================================================');
  console.log('  BOOKING STRESS TEST RESULTS');
  console.log('====================================================\n');

  const allMetrics = Object.values(metrics);
  const totalRequests    = allMetrics.reduce((s, m) => s + m.requests, 0);
  const totalErrors      = allMetrics.reduce((s, m) => s + m.errors, 0);
  const totalRateLimited = allMetrics.reduce((s, m) => s + m.rateLimited, 0);
  const totalTimeouts    = allMetrics.reduce((s, m) => s + m.timeouts, 0);
  const allLatencies     = allMetrics.flatMap(m => getLatencies(m));
  const overallRps       = testDurationSec > 0 ? (totalRequests / testDurationSec).toFixed(1) : 0;

  console.log('  OVERALL');
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${overallRps} req/s`);
  console.log(`  Real errors:       ${totalErrors} (${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0}%)`);
  console.log(`  Rate limited:      ${totalRateLimited} (${totalRequests > 0 ? ((totalRateLimited / totalRequests) * 100).toFixed(2) : 0}%) — expected under load`);
  console.log(`  Timeouts:          ${totalTimeouts} (${totalRequests > 0 ? ((totalTimeouts / totalRequests) * 100).toFixed(2) : 0}%)`);
  if (workerUnhandledErrors > 0) {
    console.log(`  Unhandled errors:  ${workerUnhandledErrors} (unexpected runtime failures — check server logs)`);
  }
  console.log(`  Overall p50:       ${percentile(allLatencies, 50)}ms`);
  console.log(`  Overall p95:       ${percentile(allLatencies, 95)}ms`);
  console.log(`  Overall p99:       ${percentile(allLatencies, 99)}ms\n`);

  console.log(`  Bookings created:  ${bookingRegistry.length}`);

  const header = '  Endpoint              Reqs   RPS    Errs     429s  Timeouts   p50     p95     p99     Status Codes';
  console.log('\n' + header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (const m of allMetrics) {
    const lats = getLatencies(m);
    const p50  = percentile(lats, 50);
    const p95  = percentile(lats, 95);
    const p99  = percentile(lats, 99);
    const rps  = testDurationSec > 0 ? (m.requests / testDurationSec).toFixed(1) : 0;
    const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
    const name = m.name.padEnd(20);
    console.log(`  ${name} ${String(m.requests).padStart(5)}  ${String(rps).padStart(5)}  ${String(m.errors).padStart(5)}  ${String(m.rateLimited).padStart(7)}  ${String(m.timeouts).padStart(7)}  ${String(p50).padStart(5)}ms ${String(p95).padStart(5)}ms ${String(p99).padStart(5)}ms   ${codes}`);
  }

  console.log(`\n  Flows under test (all via server API, user-context JWT):`);
  console.log(`    • GET  /api/provider/available-slots/:id?date=  — slot availability reads`);
  console.log(`    • POST /api/booking/create                     — concurrent booking creation (race target)`);
  console.log(`    • POST /api/booking/cancel                     — booking cancellation (frees slots)`);
  console.log(`    • GET  /api/provider/schedule/:id              — provider weekly schedule reads`);

  const getMetrics = [metrics.availableSlots, metrics.schedule];
  const postMetrics = [metrics.createBooking, metrics.cancelBooking];
  const getLats = getMetrics.flatMap(m => getLatencies(m));
  const postLats = postMetrics.flatMap(m => getLatencies(m));
  const getP95 = percentile(getLats, 95);
  const postP95 = percentile(postLats, 95);
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ------------------------------------------------------------');

  const criteria = [
    { name: 'GET p95 < 2000ms',          value: `${getP95}ms`,                  pass: getP95 < 2000 },
    { name: 'POST p95 < 3000ms',         value: `${postP95}ms`,                 pass: postP95 < 3000 },
    { name: 'Error rate < 2% (excl 429, slot-full)', value: `${errorRate.toFixed(2)}%`, pass: errorRate < 2 },
    { name: 'No double-booking',          value: `${integrityResult.overbooked} overbooked slots`, pass: integrityResult.pass },
  ];

  for (const c of criteria) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    console.log(`  [${tag}] ${c.name.padEnd(30)} ${c.value}`);
  }

  console.log('\n====================================================\n');
}

async function cleanup(cleanupState) {
  console.log('\n[Teardown] Cleaning up test data...');

  const allBookingIds = bookingRegistry.map(b => b.bookingId);
  if (allBookingIds.length > 0) {
    for (let i = 0; i < allBookingIds.length; i += 100) {
      const batch = allBookingIds.slice(i, i + 100);
      await supabaseAdmin.from('slot_bookings').delete().in('id', batch);
    }
    console.log(`  Deleted ${allBookingIds.length} slot_bookings rows`);
  }

  const { data: leftover } = await supabaseAdmin
    .from('slot_bookings')
    .select('id')
    .eq('booking_date', BOOKING_DATE)
    .ilike('member_notes', '%Stress test%');

  if (leftover && leftover.length > 0) {
    await supabaseAdmin.from('slot_bookings').delete().in('id', leftover.map(b => b.id));
    console.log(`  Deleted ${leftover.length} additional leftover bookings`);
  }

  if (cleanupState.originalWorkingHours.length > 0) {
    for (const orig of cleanupState.originalWorkingHours) {
      await supabaseAdmin
        .from('provider_working_hours')
        .update({
          bay_capacity: orig.bayCapacity,
          start_time: orig.startTime,
          end_time: orig.endTime,
          is_active: orig.isActive,
        })
        .eq('id', orig.id);
    }
    console.log(`  Restored ${cleanupState.originalWorkingHours.length} original working hours`);
  }

  if (cleanupState.createdWorkingHourIds.length > 0) {
    await supabaseAdmin.from('provider_working_hours').delete().in('id', cleanupState.createdWorkingHourIds);
    console.log(`  Deleted ${cleanupState.createdWorkingHourIds.length} created working hour rows`);
  }

  try {
    await supabaseAdmin
      .from('notifications')
      .delete()
      .in('type', ['booking_created', 'booking_cancelled'])
      .ilike('message', '%Stress test%');
  } catch {}

  console.log('  Cleanup complete');
}

async function main() {
  const cleanupState = {
    originalWorkingHours: [],
    createdWorkingHourIds: [],
  };

  let data;

  try {
    console.log('\n====================================================');
    console.log('  My Car Concierge — Booking Concurrent Stress Test');
    console.log('====================================================');
    console.log(`  Concurrency: ${CONFIG.concurrency} | Duration: ${CONFIG.duration}s | Ramp-up: ${CONFIG.rampUpTime}s`);
    console.log(`  Providers: ${CONFIG.providerCount} | Bay capacity: ${CONFIG.bayCapacity}`);
    console.log(`  Target date: ${BOOKING_DATE}`);
    console.log(`  Base URL: ${BASE_URL}`);
    console.log('====================================================\n');

    console.log('[Setup] Loading simulation data and seeding fixtures...');
    data = await loadSimData(cleanupState);

    const testStart = Date.now();

    console.log('\n[Phase 1/4] Ramp-up...');
    await runPhase('Ramp-up', CONFIG.concurrency, CONFIG.rampUpTime * 1000, data);

    console.log('[Phase 2/4] Sustained load...');
    const sustainedDuration = Math.max(10, CONFIG.duration - CONFIG.rampUpTime - CONFIG.spikeDuration - CONFIG.coolDownDuration);
    await runPhase('Sustained', CONFIG.concurrency, sustainedDuration * 1000, data);

    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000, data);

    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool-down', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, data);

    const testDurationSec = (Date.now() - testStart) / 1000;

    const integrityResult = await checkDoubleBookings(data.providerIds);

    printResults(data, testDurationSec, integrityResult);
  } catch (err) {
    console.error('\n[FATAL]', err.message);
  } finally {
    await cleanup(cleanupState);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
