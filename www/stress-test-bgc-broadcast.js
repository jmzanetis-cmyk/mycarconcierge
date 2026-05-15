// Stress test — BGC launch broadcast script (Task #227 / Task #164)
//
// Validates scripts/send-bgc-launch-broadcast.js as the primary subject.
// The script is a single-batch, sleep-throttled subprocess (not a concurrent
// HTTP surface), so the four-phase pattern is mapped onto progressively
// larger seeded recipient pools, and the assertions verify the operationally-
// critical properties:
//
//   1. Throttle holds — at the script's default --rate=8 the wall-clock
//      runtime should be at least N / rate seconds (with a tolerance for
//      auth + first-batch warm-up). This is the bedrock guarantee that
//      keeps Resend rate limits and inbox-provider reputation safe.
//   2. Idempotency — recipients already present in bgc_launch_email_sends
//      are skipped via the script's `alreadySent.has(email)` check
//      (recordSkip('already_sent')). Pre-seeding rows for half of the
//      recipients should produce exactly that many `already_sent` skips.
//      This is what makes a re-run / `--continue`-after-preview safe.
//   3. Suppression — recipients in email_unsubscribes are skipped via
//      `suppressedEmails.has(email)` (recordSkip('suppressed')).
//   4. --dry-run produces no log writes — bgc_launch_email_sends should
//      remain empty for our stress recipients (only the pre-seeded rows
//      from idempotency setup remain).
//   5. The script exits 0 cleanly under each load profile.
//
// FAST mode (default): 200-recipient sustained phase at --rate=20 (~10s)
// FULL mode (BGC_BROADCAST_STRESS_FULL=1): 5000-recipient sustained phase
//   at --rate=8 (~625s) — matches production behavior for the launch
//   announcement and is the canonical pre-launch dress rehearsal.
//
// Usage:
//   node www/stress-test-bgc-broadcast.js
//   BGC_BROADCAST_STRESS_FULL=1 node www/stress-test-bgc-broadcast.js
//   node www/stress-test-bgc-broadcast.js --warmup=20 --sustained=200 --spike=400 --cooldown=40 --rate=20

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
  return f ? Number.parseInt(f.split('=')[1], 10) : def;
}
function flag(name) {
  return args.includes(`--${name}`);
}

const FULL_MODE = process.env.BGC_BROADCAST_STRESS_FULL === '1' || flag('full');

// Sane defaults: a fast CI-friendly run that still fully exercises throttle,
// idempotency, suppression, and dry-run-no-write properties. FULL mode swaps
// in the production-realistic 5000 / rate=8 numbers.
const CONFIG = FULL_MODE ? {
  rateRps:        param('rate', 8),
  warmupLimit:    param('warmup', 50),
  sustainedLimit: param('sustained', 5000),
  spikeLimit:     param('spike', 1000),
  cooldownLimit:  param('cooldown', 100),
  // 5000 / 8 = 625s at the floor; allow generous timeout for first-batch
  // warm-up + auth + suppression-list loading.
  phaseTimeoutMs: param('phase-timeout', 900_000),
  // Idempotency phase: how many of the seeded recipients to pre-mark as
  // already-sent (the script must skip them).
  idempotencyPreSeed: param('idempotency-preseed', 1000),
  // Suppression phase: how many to add to email_unsubscribes BEFORE the run.
  suppressionPreSeed: param('suppression-preseed', 500),
} : {
  rateRps:        param('rate', 20),
  warmupLimit:    param('warmup', 20),
  sustainedLimit: param('sustained', 200),
  spikeLimit:     param('spike', 100),
  cooldownLimit:  param('cooldown', 40),
  phaseTimeoutMs: param('phase-timeout', 60_000),
  idempotencyPreSeed: param('idempotency-preseed', 50),
  suppressionPreSeed: param('suppression-preseed', 25),
};

const STRESS_TAG = 'stress-bgc-broadcast-' + Date.now();
const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'send-bgc-launch-broadcast.js');
const STRESS_DOMAIN = 'mcc-stress-broadcast.test';
// Captured at module load so the agent_memory cleanup sweep can scope to
// rows written during this run (Task #230).
const testStartIso = new Date().toISOString();

const phaseResults = [];

async function seedRecipients(count) {
  const seeded = [];
  // Bulk-insert in batches of 200 so 5000-row seeds don't time out.
  const BATCH = 200;
  for (let off = 0; off < count; off += BATCH) {
    const rows = [];
    for (let i = off; i < Math.min(count, off + BATCH); i++) {
      rows.push({
        email: `stress-${STRESS_TAG}-${i}@${STRESS_DOMAIN}`,
        full_name: `Stress Recipient ${i}`,
        first_name: 'Stress',
        role: 'member',
      });
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert(rows)
      .select('id, email');
    if (!error && data) seeded.push(...data);
    else if (error) console.warn(`  [WARN] seed batch ${off}: ${error.message}`);
  }
  return seeded;
}

async function preSeedAlreadySent(emails) {
  // Insert into bgc_launch_email_sends so the script's loadAlreadySent()
  // sees these emails and recordSkip('already_sent') fires.
  if (!emails.length) return 0;
  const BATCH = 200;
  let inserted = 0;
  for (let off = 0; off < emails.length; off += BATCH) {
    const rows = emails.slice(off, off + BATCH).map(email => ({
      email,
      audience: 'customer',
      status: 'sent',
      sent_at: new Date().toISOString(),
      // Tag so cleanup is precise.
      resend_message_id: `${STRESS_TAG}-preseed-${email}`,
    }));
    try {
      const { error } = await supabaseAdmin.from('bgc_launch_email_sends').insert(rows);
      if (!error) inserted += rows.length;
      else console.warn(`  [WARN] pre-seed already-sent batch ${off}: ${error.message}`);
    } catch (e) {
      console.warn(`  [WARN] bgc_launch_email_sends table missing? ${e.message}`);
      return 0;
    }
  }
  return inserted;
}

async function preSeedSuppressed(emails) {
  // Insert into email_unsubscribes so suppression set picks them up.
  if (!emails.length) return 0;
  const BATCH = 200;
  let inserted = 0;
  for (let off = 0; off < emails.length; off += BATCH) {
    const rows = emails.slice(off, off + BATCH).map(email => ({
      email,
      source: STRESS_TAG,
    }));
    try {
      const { error } = await supabaseAdmin.from('email_unsubscribes').insert(rows);
      if (!error) inserted += rows.length;
    } catch (e) {
      console.warn(`  [WARN] email_unsubscribes table missing? ${e.message}`);
      return 0;
    }
  }
  return inserted;
}

// Suppression source #2: outreach_leads.status IN ('unsubscribed','bounced').
// The broadcast script unions these emails into the suppression set via
// loadOutreachOptOuts(), so any candidate present here must be skipped
// even if they were never written to email_unsubscribes.
async function preSeedOutreachOptOuts(emails) {
  if (!emails.length) return 0;
  const BATCH = 200;
  let inserted = 0;
  for (let off = 0; off < emails.length; off += BATCH) {
    const rows = emails.slice(off, off + BATCH).map(email => ({
      email,
      status: 'unsubscribed',
      source: STRESS_TAG,
    }));
    try {
      const { error } = await supabaseAdmin.from('outreach_leads').insert(rows);
      if (!error) inserted += rows.length;
    } catch (e) {
      console.warn(`  [WARN] outreach_leads table missing? ${e.message}`);
      return 0;
    }
  }
  return inserted;
}

// Suppression source #3: member_notification_preferences.marketing_emails=false.
// The broadcast script unions these member_ids via loadMarketingOptOuts()
// and skips them with reason='marketing_opt_out'. We need profile.id values
// here, not emails — caller passes member rows.
async function preSeedMarketingOptOuts(memberIds) {
  if (!memberIds.length) return 0;
  const BATCH = 200;
  let inserted = 0;
  for (let off = 0; off < memberIds.length; off += BATCH) {
    const rows = memberIds.slice(off, off + BATCH).map(id => ({
      member_id: id,
      marketing_emails: false,
    }));
    try {
      // Use upsert in case the table has a unique constraint on member_id.
      const { error } = await supabaseAdmin
        .from('member_notification_preferences')
        .upsert(rows, { onConflict: 'member_id' });
      if (!error) inserted += rows.length;
    } catch (e) {
      console.warn(`  [WARN] member_notification_preferences table missing? ${e.message}`);
      return 0;
    }
  }
  return inserted;
}

async function cleanup() {
  // Tear down in dependency order. Best-effort on derived tables in case
  // they don't exist locally.
  const { data: rows } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .like('email', `stress-${STRESS_TAG}-%`);
  const emails = (rows || []).map(r => r.email);
  const ids = (rows || []).map(r => r.id);
  if (emails.length > 0) {
    try { await supabaseAdmin.from('bgc_launch_email_sends').delete().in('email', emails); } catch {}
    try { await supabaseAdmin.from('email_unsubscribes').delete().in('email', emails); } catch {}
    try { await supabaseAdmin.from('outreach_leads').delete().in('email', emails); } catch {}
  }
  if (ids.length > 0) {
    try { await supabaseAdmin.from('member_notification_preferences').delete().in('member_id', ids); } catch {}
    await supabaseAdmin.from('profiles').delete().in('id', ids);
  }
  // Defensive sweep for orphaned stress-domain rows (in case prior runs leaked).
  await supabaseAdmin.from('profiles').delete().like('email', `%@${STRESS_DOMAIN}`);
  // Cleanup any rows tagged with our STRESS_TAG across all suppression sources.
  try { await supabaseAdmin.from('email_unsubscribes').delete().eq('source', STRESS_TAG); } catch {}
  try { await supabaseAdmin.from('outreach_leads').delete().eq('source', STRESS_TAG); } catch {}
  // Audit-row cleanup (Task #230). The broadcast script may seed
  // agent_memory rows when priming its dedupe cache for the stress
  // recipient set. Sweep any row written since test start whose
  // value/key references our STRESS_TAG so repeated runs don't
  // accumulate stale dedupe entries. Best-effort — table may not exist
  // and the script may not currently write here, but defensive cleanup
  // protects against future regressions.
  try {
    await supabaseAdmin.from('agent_memory')
      .delete()
      .gte('created_at', testStartIso)
      .like('key', `%${STRESS_TAG}%`);
  } catch {}
}

function runBroadcastDryRun(limit, rate) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn('node', [
      SCRIPT_PATH,
      '--dry-run',
      `--limit=${limit}`,
      `--rate=${rate}`,
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
      resolve({
        limit, rate,
        durationMs: Date.now() - start,
        exitCode: killed ? -1 : code,
        killed, stdout, stderr,
      });
    });
    child.on('error', (err) => {
      clearTimeout(killTimer);
      resolve({
        limit, rate,
        durationMs: Date.now() - start,
        exitCode: -1, error: err.message,
        stdout, stderr,
      });
    });
  });
}

// Parse the script's `[customer] skip reasons: {"already_sent":N,...}` log line.
function parseSkipReasons(stdout) {
  const m = stdout.match(/skip reasons:\s*(\{[^}]+\})/);
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch { return {}; }
}

// Parse the script's eligible/skipped counts.
function parseCounts(stdout) {
  const m = stdout.match(/eligible=(\d+)\s+skipped=(\d+)\s+totalProfiles=(\d+)/);
  if (!m) return null;
  return { eligible: +m[1], skipped: +m[2], totalProfiles: +m[3] };
}

// Pretty-print one phase's result line + any sub-detail rows. Extracted
// from runPhase to keep the orchestrator under the cognitive-complexity
// budget (Task #262).
function _logPhaseSummary(name, r, expectedMinMs, throttleHeld, skipReasons, counts) {
  console.log(`    Phase: ${name}, exit: ${r.exitCode}, runtime: ${(r.durationMs/1000).toFixed(1)}s, expected min: ${(expectedMinMs/1000).toFixed(1)}s, throttle: ${throttleHeld ? 'OK' : 'FAILED'}`);
  if (counts) console.log(`    eligible=${counts.eligible} skipped=${counts.skipped} totalProfiles=${counts.totalProfiles}`);
  if (Object.keys(skipReasons).length > 0) console.log(`    skip reasons: ${JSON.stringify(skipReasons)}`);
  if (r.exitCode !== 0) {
    const tail = (r.stderr || '').slice(-600);
    if (tail) console.log(`    [WARN] stderr tail:\n${tail}`);
  }
}

async function runPhase(name, limit, rate = CONFIG.rateRps, opts = {}) {
  console.log(`  Running broadcast --dry-run --limit=${limit} --rate=${rate}...`);
  const r = await runBroadcastDryRun(limit, rate);
  // Theoretical minimum runtime: limit / rate seconds.
  // Allow 60% of theoretical to account for warm-up + first-batch latency.
  const expectedMinMs = limit > 0 ? Math.floor((limit / rate) * 1000 * 0.6) : 0;
  const throttleHeld = r.durationMs >= expectedMinMs;
  const skipReasons = parseSkipReasons(r.stdout);
  const counts = parseCounts(r.stdout);
  _logPhaseSummary(name, r, expectedMinMs, throttleHeld, skipReasons, counts);
  phaseResults.push({ name, ...r, throttleHeld, skipReasons, counts, ...opts });
  return r;
}

async function checkNoLogWritesInDryRun(preSeededCount) {
  // After --dry-run, bgc_launch_email_sends should ONLY contain the
  // pre-seeded rows (no new writes from --dry-run). If it contains more,
  // dry-run is leaking writes — a release-blocker.
  try {
    const { data: rows } = await supabaseAdmin
      .from('bgc_launch_email_sends')
      .select('email, resend_message_id')
      .like('email', `stress-${STRESS_TAG}-%`);
    return {
      total: (rows || []).length,
      preSeeded: (rows || []).filter(r => (r.resend_message_id || '').startsWith(`${STRESS_TAG}-preseed-`)).length,
      unexpected: (rows || []).filter(r => !(r.resend_message_id || '').startsWith(`${STRESS_TAG}-preseed-`)).length,
    };
  } catch {
    return { total: 0, preSeeded: 0, unexpected: 0 };
  }
}

function printResults() {
  console.log('\n====================================================');
  console.log('  BGC Broadcast — RESULTS');
  console.log('====================================================');
  for (const p of phaseResults) {
    console.log(`  ${p.name.padEnd(14)} limit=${String(p.limit).padEnd(6)} runtime=${(p.durationMs/1000).toFixed(1)}s exit=${p.exitCode} throttle=${p.throttleHeld ? 'OK' : 'FAILED'}`);
  }
  const allClean = phaseResults.every(p => p.exitCode === 0);
  const allThrottled = phaseResults.every(p => p.throttleHeld);
  return { allClean, allThrottled };
}

async function main() {
  console.log('\n====================================================');
  console.log('  MCC — BGC Broadcast Stress Test');
  console.log('====================================================');
  console.log(`  Mode:           ${FULL_MODE ? 'FULL (production-realistic 5000 @ rate=8)' : 'FAST (CI-friendly)'}`);
  console.log(`  Phases:         warm=${CONFIG.warmupLimit}, sustained=${CONFIG.sustainedLimit}, spike=${CONFIG.spikeLimit}, cool=${CONFIG.cooldownLimit}`);
  console.log(`  Rate:           ${CONFIG.rateRps} sends/sec`);
  console.log(`  Idempotency:    pre-seed ${CONFIG.idempotencyPreSeed} into bgc_launch_email_sends`);
  console.log(`  Suppression:    pre-seed ${CONFIG.suppressionPreSeed} into email_unsubscribes`);
  console.log(`  Phase timeout:  ${(CONFIG.phaseTimeoutMs/1000).toFixed(0)}s`);
  console.log('====================================================\n');

  let exitCode = 1;
  let preSeededAlready = 0;
  let preSeededOutreach = 0;
  let preSeededMarketing = 0;
  try {
    console.log('[Setup] Defensive cleanup of any prior stress rows...');
    await cleanup();

    const max = Math.max(
      CONFIG.warmupLimit,
      CONFIG.sustainedLimit,
      CONFIG.spikeLimit,
      CONFIG.cooldownLimit,
    );
    console.log(`[Setup] Seeding ${max} stress recipients...`);
    const seeded = await seedRecipients(max);
    console.log(`  Seeded ${seeded.length} stress recipients`);
    if (seeded.length === 0) {
      console.error('  No recipients seeded; aborting.');
      process.exit(1);
    }

    // Idempotency setup: mark first N recipients as already-sent.
    const idempEmails = seeded.slice(0, CONFIG.idempotencyPreSeed).map(r => r.email);
    console.log(`[Setup] Pre-seeding ${idempEmails.length} into bgc_launch_email_sends (already-sent)...`);
    preSeededAlready = await preSeedAlreadySent(idempEmails);
    console.log(`  Inserted ${preSeededAlready} already-sent rows`);
    // HARD assertion: if the pre-seed didn't insert all requested rows, the
    // idempotency criterion below would silently degrade to a weaker bound.
    // Abort the run rather than let that vacuous-pass path open.
    if (preSeededAlready !== idempEmails.length) {
      console.error(`  [FATAL] Pre-seed inserted ${preSeededAlready} of ${idempEmails.length} requested already-sent rows. Aborting to avoid weakened idempotency assertion.`);
      process.exit(1);
    }

    // Suppression setup: mark next K recipients as unsubscribed (does NOT
    // overlap with idempotency set so we can attribute skip reasons).
    const suppressEmails = seeded
      .slice(CONFIG.idempotencyPreSeed, CONFIG.idempotencyPreSeed + CONFIG.suppressionPreSeed)
      .map(r => r.email);
    console.log(`[Setup] Pre-seeding ${suppressEmails.length} into email_unsubscribes (suppression)...`);
    const preSeededSupp = await preSeedSuppressed(suppressEmails);
    console.log(`  Inserted ${preSeededSupp} unsubscribe rows`);
    if (preSeededSupp !== suppressEmails.length) {
      console.error(`  [FATAL] Pre-seed inserted ${preSeededSupp} of ${suppressEmails.length} requested suppressed rows. Aborting to avoid weakened suppression assertion.`);
      process.exit(1);
    }

    // Suppression source #2: outreach_leads.status='unsubscribed'.
    // Use a distinct slice so we can attribute the skip count to the
    // outreach-leads source independently of email_unsubscribes.
    const outreachStart = CONFIG.idempotencyPreSeed + CONFIG.suppressionPreSeed;
    const outreachEnd = outreachStart + CONFIG.suppressionPreSeed;
    const outreachEmails = seeded.slice(outreachStart, outreachEnd).map(r => r.email);
    console.log(`[Setup] Pre-seeding ${outreachEmails.length} into outreach_leads (status=unsubscribed)...`);
    preSeededOutreach = await preSeedOutreachOptOuts(outreachEmails);
    console.log(`  Inserted ${preSeededOutreach} outreach-opt-out rows`);
    if (preSeededOutreach !== outreachEmails.length) {
      // Soft-fail to a warning here — the outreach_leads table may not
      // exist on every test fixture and we still want the run to proceed
      // for the primary suppression source. The criterion below downgrades
      // accordingly.
      console.warn(`  [WARN] outreach_leads pre-seed inserted ${preSeededOutreach} of ${outreachEmails.length}; outreach-suppression criterion will be skipped.`);
    }

    // Suppression source #3: member_notification_preferences.marketing_emails=false.
    // We need profile.id values, not emails — pull them from the seeded set.
    const marketingStart = outreachEnd;
    const marketingEnd = marketingStart + CONFIG.suppressionPreSeed;
    const marketingMembers = seeded.slice(marketingStart, marketingEnd);
    const marketingIds = marketingMembers.map(r => r.id).filter(Boolean);
    console.log(`[Setup] Pre-seeding ${marketingIds.length} into member_notification_preferences (marketing_emails=false)...`);
    preSeededMarketing = await preSeedMarketingOptOuts(marketingIds);
    console.log(`  Inserted ${preSeededMarketing} marketing-opt-out rows`);
    if (preSeededMarketing !== marketingIds.length) {
      console.warn(`  [WARN] member_notification_preferences pre-seed inserted ${preSeededMarketing} of ${marketingIds.length}; marketing-opt-out criterion will be skipped.`);
    }

    // Concurrent suppression-write pressure: while the broadcast runs, append
    // additional rows to email_unsubscribes from a separate process to verify
    // the suppression-write path remains writable under broadcast load (no
    // table locks, no rate-limit collisions). The rows go into the cleanup
    // sweep via STRESS_TAG so teardown handles them.
    const liveSuppressionEmails = [];
    const liveSuppressionTask = (async () => {
      // Use an offset that doesn't collide with the deterministic pre-seeds
      // — these are fresh emails created on the fly to exercise mid-run
      // INSERT capacity, NOT to be picked up by the broadcast suppression
      // set (the script loads suppression once at the top of each run).
      const N = 50;
      for (let i = 0; i < N; i++) {
        const email = `stress-${STRESS_TAG}-live-${i}@${STRESS_DOMAIN}`;
        liveSuppressionEmails.push(email);
        try {
          await supabaseAdmin
            .from('email_unsubscribes')
            .insert({ email, source: STRESS_TAG });
        } catch { /* non-fatal */ }
        // Spread writes across the canonical phase window (~rate=8 → 50 emails ≈ 6s).
        await new Promise(r => setTimeout(r, 120));
      }
    })();

    console.log('\n[Phase 1/4] Warm-up broadcast...');
    await runPhase('Warm', CONFIG.warmupLimit);
    console.log('[Phase 2/4] Sustained broadcast (canonical run)...');
    await runPhase('Sustained', CONFIG.sustainedLimit, CONFIG.rateRps, { canonical: true });
    console.log('[Phase 3/4] Spike broadcast...');
    await runPhase('Spike', CONFIG.spikeLimit);
    console.log('[Phase 4/4] Cool-down broadcast...');
    await runPhase('Cool', CONFIG.cooldownLimit);

    // Drain the concurrent suppression-write task and verify all rows landed.
    console.log('\n[Integrity] Awaiting concurrent suppression-write task...');
    await liveSuppressionTask;
    let liveSuppressionWrites = 0;
    try {
      const { data: liveRows } = await supabaseAdmin
        .from('email_unsubscribes')
        .select('email')
        .in('email', liveSuppressionEmails);
      liveSuppressionWrites = (liveRows || []).length;
    } catch { /* table absent — handled by criterion */ }
    console.log(`  Concurrent suppression writes landed: ${liveSuppressionWrites}/${liveSuppressionEmails.length}`);

    console.log('\n[Integrity] Verifying --dry-run produced no extra log writes...');
    const logState = await checkNoLogWritesInDryRun(preSeededAlready);
    console.log(`  bgc_launch_email_sends rows for stress recipients: total=${logState.total}, preSeeded=${logState.preSeeded}, unexpected=${logState.unexpected}`);

    // Pull the canonical (Sustained) phase to assert idempotency + suppression.
    const canonical = phaseResults.find(p => p.canonical);
    const canonicalSkips = (canonical && canonical.skipReasons) || {};
    const canonicalCounts = canonical && canonical.counts;
    const sawAlreadySent = (canonicalSkips.already_sent || 0);
    const sawSuppressed = (canonicalSkips.suppressed || 0);
    // If we couldn't parse counts/skip-reasons from the script's stdout
    // (the format changed, the run crashed before logging the eligibility
    // summary, etc.) we should HARD FAIL rather than silently pass with
    // missing-treated-as-zero. The pre-seed lower bounds below would
    // otherwise be vacuous.
    const parsedScriptOutput = !!canonicalCounts && Object.keys(canonicalSkips).length > 0;
    // We pre-seeded EXACTLY `preSeededAlready` rows into bgc_launch_email_sends
    // and EXACTLY `preSeededSupp` rows into email_unsubscribes. The script
    // processes ALL loaded profiles before --limit, so these pre-seeded
    // recipients MUST appear in skip counts. (>= because the DB may also
    // contain real already-sent / unsubscribed rows from prior broadcasts.)
    const expectedAlreadySentMin = preSeededAlready;
    const expectedSuppressedMin = preSeededSupp;

    const { allClean, allThrottled } = printResults();

    console.log('\n  PASS/FAIL CRITERIA');
    console.log('  ' + '-'.repeat(68));
    const criteria = [
      { name: 'All phases exit 0',
        value: allClean ? 'YES' : 'NO',
        pass: allClean },
      { name: 'Throttle holds in all phases',
        value: allThrottled ? 'YES' : 'NO',
        pass: allThrottled },
      { name: '--dry-run wrote no NEW rows (only pre-seed remains)',
        value: `${logState.unexpected} unexpected`,
        pass: logState.unexpected === 0 },
      { name: 'Pre-seed rows still intact after dry-run',
        // If dry-run accidentally deletes/mutates pre-seeded rows the
        // unexpected==0 check above could still pass. Require the exact
        // pre-seeded row count to remain.
        value: `preSeeded=${logState.preSeeded} expected=${preSeededAlready}`,
        pass: logState.preSeeded === preSeededAlready },
      { name: 'Canonical phase stdout parsed (counts + skip reasons)',
        value: parsedScriptOutput ? 'YES' : 'NO — log format may have changed',
        pass: parsedScriptOutput },
      { name: `Idempotency: ≥ ${expectedAlreadySentMin} pre-seeded skipped (already_sent)`,
        value: `saw=${sawAlreadySent}`,
        pass: parsedScriptOutput && sawAlreadySent >= expectedAlreadySentMin },
      { name: `Suppression: ≥ ${expectedSuppressedMin} pre-seeded skipped (suppressed)`,
        value: `saw=${sawSuppressed}`,
        pass: parsedScriptOutput && sawSuppressed >= expectedSuppressedMin },
      // Suppression source #2 (outreach_leads) — emails marked
      // status='unsubscribed' are unioned into the suppression set by
      // loadOutreachOptOuts and therefore counted as 'suppressed' skips
      // by the script (it doesn't distinguish source). The lower bound
      // here therefore stacks on top of the email_unsubscribes pre-seed
      // when the outreach pre-seed succeeded.
      { name: `Outreach suppression: ≥ ${preSeededOutreach + expectedSuppressedMin} total suppressed (outreach + email_unsubscribes)`,
        value: preSeededOutreach > 0
          ? `saw=${sawSuppressed} expected≥${preSeededOutreach + expectedSuppressedMin}`
          : 'N/A — outreach_leads pre-seed unavailable',
        pass: preSeededOutreach === 0
          || (parsedScriptOutput && sawSuppressed >= preSeededOutreach + expectedSuppressedMin) },
      // Suppression source #3 (member_notification_preferences) — these
      // recipients are skipped with reason='marketing_opt_out' (a
      // separate skip-bucket from 'suppressed').
      { name: `Marketing opt-out: ≥ ${preSeededMarketing} skipped (marketing_opt_out)`,
        value: preSeededMarketing > 0
          ? `saw=${canonicalSkips.marketing_opt_out || 0}`
          : 'N/A — member_notification_preferences pre-seed unavailable',
        pass: preSeededMarketing === 0
          || (parsedScriptOutput && (canonicalSkips.marketing_opt_out || 0) >= preSeededMarketing) },
      // Concurrent suppression-write pressure — every row written mid-run
      // by liveSuppressionTask must be readable post-run. Anything less
      // than the full count indicates the suppression-write path was
      // throttled, locked out, or silently dropped during the broadcast.
      { name: `Concurrent suppression writes: all ${liveSuppressionEmails.length} landed`,
        value: `${liveSuppressionWrites}/${liveSuppressionEmails.length}`,
        pass: liveSuppressionEmails.length > 0 && liveSuppressionWrites === liveSuppressionEmails.length },
    ];
    for (const c of criteria) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(56)} ${c.value}`);
    }
    console.log('====================================================\n');

    exitCode = criteria.every(c => c.pass) ? 0 : 1;
  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack);
  } finally {
    console.log('[Cleanup] Removing stress recipients + derived rows...');
    await cleanup();
    process.exit(exitCode);
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });
