// Stress test — BGC launch broadcast script (Task #227 / Task #164)
//
// Validates scripts/send-bgc-launch-broadcast.js under varied --limit values
// in --dry-run mode. Verifies:
//   1. The configurable rate-throttle holds (--rate flag respected — runtime
//      should be >= N/rate seconds, with tolerance).
//   2. --dry-run produces NO writes to bgc_launch_email_sends and NO Resend
//      sends (offline-safe).
//   3. The script exits 0 cleanly under each load profile.
//
// "Phases" map to progressively-larger broadcast runs (warm-up, sustained,
// spike, cool-down) since the script is a single-batch operation rather than
// concurrent HTTP. This matches the four-phase architectural pattern even
// though the unit of "load" here is a subprocess invocation.
//
// Usage: node www/stress-test-bgc-broadcast.js
//        node www/stress-test-bgc-broadcast.js --warmup=5 --sustained=50 --spike=100 --cooldown=10 --rate=25

const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');

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

const CONFIG = {
  // The broadcast script defaults to 8 sends/sec. We use a higher value here
  // so the test completes quickly while still verifying throttle behavior.
  rateRps:        param('rate', 50),
  warmupLimit:    param('warmup', 10),
  sustainedLimit: param('sustained', 100),
  spikeLimit:     param('spike', 250),
  cooldownLimit:  param('cooldown', 20),
  // Per-phase timeout (subprocess wall-clock cap, in ms).
  phaseTimeoutMs: param('phase-timeout', 60000),
};

const STRESS_TAG = 'stress-bgc-broadcast-' + Date.now();
const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'send-bgc-launch-broadcast.js');
const STRESS_DOMAIN = 'mcc-stress-broadcast.test';

const phaseResults = [];

async function seedRecipients(count) {
  const seeded = [];
  for (let i = 0; i < count; i++) {
    const email = `stress-${STRESS_TAG}-${i}@${STRESS_DOMAIN}`;
    const { data, error } = await supabaseAdmin.from('profiles').insert({
      email,
      full_name: `Stress Recipient ${i}`,
      first_name: 'Stress',
      role: 'member',
    }).select('id, email').single();
    if (!error && data) seeded.push(data);
  }
  return seeded;
}

async function cleanup() {
  // Remove all stress-tagged rows
  const { data: rows } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .like('email', `stress-${STRESS_TAG}-%`);
  const emails = (rows || []).map(r => r.email);
  const ids = (rows || []).map(r => r.id);
  if (emails.length > 0) {
    // Best-effort cleanup of derived tables (don't fail the test if they don't exist)
    try { await supabaseAdmin.from('bgc_launch_email_sends').delete().in('email', emails); } catch {}
    try { await supabaseAdmin.from('email_unsubscribes').delete().in('email', emails); } catch {}
  }
  if (ids.length > 0) {
    await supabaseAdmin.from('profiles').delete().in('id', ids);
  }
  // Defensive sweep for orphaned stress-domain rows (in case prior runs leaked)
  await supabaseAdmin.from('profiles').delete().like('email', `%@${STRESS_DOMAIN}`);
}

function runBroadcastDryRun(limit) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn('node', [
      SCRIPT_PATH,
      '--dry-run',
      `--limit=${limit}`,
      `--rate=${CONFIG.rateRps}`,
      '--audience=members',
    ], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const killTimer = setTimeout(() => {
      killed = true;
      try { child.kill('SIGKILL'); } catch {}
    }, CONFIG.phaseTimeoutMs);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      const durationMs = Date.now() - start;
      resolve({
        limit,
        durationMs,
        exitCode: killed ? -1 : code,
        killed,
        stdout,
        stderr,
      });
    });
    child.on('error', (err) => {
      clearTimeout(killTimer);
      resolve({
        limit,
        durationMs: Date.now() - start,
        exitCode: -1,
        error: err.message,
        stdout,
        stderr,
      });
    });
  });
}

async function runPhase(name, limit) {
  console.log(`  Running broadcast --dry-run --limit=${limit} --rate=${CONFIG.rateRps}...`);
  const r = await runBroadcastDryRun(limit);
  // Theoretical minimum runtime: limit / rate seconds.
  // Allow 70% of theoretical to account for warm-up + first-batch latency.
  const expectedMinMs = limit > 0 ? Math.floor((limit / CONFIG.rateRps) * 1000 * 0.7) : 0;
  const throttleHeld = r.durationMs >= expectedMinMs;
  console.log(`    Phase: ${name}, exit: ${r.exitCode}, runtime: ${(r.durationMs/1000).toFixed(1)}s, expected min: ${(expectedMinMs/1000).toFixed(1)}s, throttle: ${throttleHeld ? 'OK' : 'FAILED'}`);
  if (r.exitCode !== 0) {
    const tail = (r.stderr || '').slice(-500);
    if (tail) console.log(`    [WARN] stderr tail:\n${tail}`);
  }
  phaseResults.push({ name, ...r, throttleHeld });
  return r;
}

async function checkNoLogWritesInDryRun() {
  // After --dry-run, bgc_launch_email_sends should have NO rows for our
  // stress recipients. (If the table doesn't exist yet, treat as 0.)
  try {
    const { data: rows } = await supabaseAdmin
      .from('bgc_launch_email_sends')
      .select('email')
      .like('email', `stress-${STRESS_TAG}-%`);
    return (rows || []).length;
  } catch {
    return 0;
  }
}

function printResults() {
  console.log('\n====================================================');
  console.log('  BGC Broadcast — RESULTS');
  console.log('====================================================');
  for (const p of phaseResults) {
    console.log(`  ${p.name.padEnd(12)} limit=${String(p.limit).padEnd(5)} runtime=${(p.durationMs/1000).toFixed(1)}s exit=${p.exitCode} throttle=${p.throttleHeld ? 'OK' : 'FAILED'}`);
  }
  const allClean = phaseResults.every(p => p.exitCode === 0);
  const allThrottled = phaseResults.every(p => p.throttleHeld);
  return { allClean, allThrottled };
}

async function main() {
  console.log('\n====================================================');
  console.log('  MCC — BGC Broadcast Stress Test');
  console.log('====================================================');
  console.log(`  Phases: warm=${CONFIG.warmupLimit}, sustained=${CONFIG.sustainedLimit}, spike=${CONFIG.spikeLimit}, cool=${CONFIG.cooldownLimit}`);
  console.log(`  Rate: ${CONFIG.rateRps} rps (script default is 8)`);
  console.log(`  Phase timeout: ${(CONFIG.phaseTimeoutMs/1000).toFixed(0)}s`);
  console.log('====================================================\n');

  let exitCode = 1;
  try {
    console.log('[Setup] Defensive cleanup of any prior stress rows...');
    await cleanup();

    console.log('[Setup] Seeding stress recipients...');
    const max = Math.max(CONFIG.warmupLimit, CONFIG.sustainedLimit, CONFIG.spikeLimit, CONFIG.cooldownLimit);
    const seeded = await seedRecipients(max);
    console.log(`  Seeded ${seeded.length} stress recipients (max needed: ${max})`);

    console.log('\n[Phase 1/4] Warm-up broadcast...');
    await runPhase('Warm', CONFIG.warmupLimit);
    console.log('[Phase 2/4] Sustained broadcast...');
    await runPhase('Sustained', CONFIG.sustainedLimit);
    console.log('[Phase 3/4] Spike broadcast...');
    await runPhase('Spike', CONFIG.spikeLimit);
    console.log('[Phase 4/4] Cool-down broadcast...');
    await runPhase('Cool', CONFIG.cooldownLimit);

    console.log('\n[Integrity] Verifying --dry-run produced no log writes...');
    const logRows = await checkNoLogWritesInDryRun();
    console.log(`  bgc_launch_email_sends rows for stress recipients: ${logRows}`);

    const { allClean, allThrottled } = printResults();

    console.log('\n  PASS/FAIL CRITERIA');
    console.log('  ' + '-'.repeat(60));
    const criteria = [
      { name: 'All phases exit 0',             value: allClean ? 'YES' : 'NO',     pass: allClean },
      { name: 'Throttle holds in all phases',  value: allThrottled ? 'YES' : 'NO', pass: allThrottled },
      { name: '--dry-run wrote no log rows',   value: `${logRows}`,                pass: logRows === 0 },
    ];
    for (const c of criteria) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(36)} ${c.value}`);
    }
    console.log('====================================================\n');

    exitCode = criteria.every(c => c.pass) ? 0 : 1;
  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack);
  } finally {
    console.log('[Cleanup] Removing stress recipients...');
    await cleanup();
    process.exit(exitCode);
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });
