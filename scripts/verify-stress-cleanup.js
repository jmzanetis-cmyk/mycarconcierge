#!/usr/bin/env node
// Task #396 — Prove the Task #230 stress-test cleanup actually leaves zero
// leftover rows.
//
// Task #230 added defensive deletes for provider_alerts, agent_events, and
// agent_memory at the end of the five new (Task #227) stress tests, but
// nothing actually verifies those deletes worked. A future regression that
// silently breaks the filter (wrong column name, jsonb cast quirks in
// PostgREST, malformed `.in()` arrays, etc.) would re-introduce the
// table-bloat problem and we'd only notice once dashboards started
// slowing down again.
//
// This script:
//   1. Generates a unique STRESS_TAG and manifest path per stress test.
//   2. Spawns each of the five stress tests back-to-back with those env
//      vars wired in. Each stress test now writes a manifest BEFORE its
//      cleanup runs that captures the seeded primary-key IDs / filter
//      scopes it used (see writeStressManifest() in each stress-test
//      script).
//   3. After every test finishes, queries each of the tables Task #230
//      cares about — care_plans, care_plan_completions, plan_bids,
//      employee_background_checks, provider_alerts, agent_events,
//      agent_memory, survey_responses, merch_orders — using the same
//      tag/ID-scoped filters the cleanup code uses, and asserts ZERO
//      rows remain.
//   4. Exits non-zero with a per-table, per-tag breakdown if anything
//      survived the cleanup; otherwise prints a green summary and exits 0.
//
// Tests that self-skip (e.g. stress-test-bgc-webhook.js when
// BGC_WEBHOOK_SECRET is unset) are surfaced as SKIPPED and don't fail the
// run, matching scripts/run-new-stress-tests.sh semantics.
//
// Usage:
//   STRESS_TEST_PASSWORD=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/verify-stress-cleanup.js
//
// Override defaults with env vars:
//   STRESS_CONCURRENCY=10 STRESS_DURATION=15 node scripts/verify-stress-cleanup.js

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ROOT_DIR = path.join(__dirname, '..');
const CONCURRENCY = process.env.STRESS_CONCURRENCY || '5';
const DURATION = process.env.STRESS_DURATION || '10';

// Each entry maps to one of the five Task #227 stress tests, with the
// args used by scripts/run-new-stress-tests.sh.
const TESTS = [
  {
    label: 'care-plan-lifecycle',
    script: 'www/stress-test-care-plan-lifecycle.js',
    args: [`--concurrency=${CONCURRENCY}`, `--duration=${DURATION}`, '--plans=5'],
    tagPrefix: 'stress-care-plan-verify',
  },
  {
    label: 'bgc-webhook',
    script: 'www/stress-test-bgc-webhook.js',
    args: [`--concurrency=${CONCURRENCY}`, `--duration=${DURATION}`],
    tagPrefix: 'stress-bgc-verify',
  },
  {
    label: 'bgc-broadcast',
    script: 'www/stress-test-bgc-broadcast.js',
    args: [
      '--warmup=5', '--sustained=20', '--spike=10', '--cooldown=5',
      '--rate=20', '--idempotency-preseed=5', '--suppression-preseed=3',
    ],
    tagPrefix: 'stress-bgc-broadcast-verify',
  },
  {
    label: 'survey-intake',
    script: 'www/stress-test-survey-intake.js',
    args: [`--concurrency=${CONCURRENCY}`, `--duration=${DURATION}`, '--allow-analytics-skip'],
    tagPrefix: 'stress-survey-verify',
  },
  {
    label: 'shop-checkout',
    script: 'www/stress-test-shop-checkout.js',
    args: [`--concurrency=${CONCURRENCY}`, `--duration=${DURATION}`],
    tagPrefix: 'stress-shop-verify',
  },
];

function freshTag(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function tmpManifestPath(label) {
  return path.join(os.tmpdir(), `mcc-stress-manifest-${label}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`);
}

function spawnTest(test, stressTag, manifestPath) {
  const env = {
    ...process.env,
    STRESS_TAG: stressTag,
    STRESS_MANIFEST_FILE: manifestPath,
  };
  const result = spawnSync('node', [test.script, ...test.args], {
    cwd: ROOT_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  const exitCode = result.status;
  let status = 'PASS';
  if (exitCode !== 0) {
    status = 'FAIL';
  } else if (/SKIPPED|— SKIPPED/.test(combined)) {
    status = 'SKIPPED';
  }
  return { exitCode, status, combined };
}

function readManifest(manifestPath) {
  try {
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { _readError: e.message };
  }
}

// Each leftover-check returns { table, scope, count, error? } so the
// summary can show exactly which filter found surviving rows.
async function countMatching(table, build) {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    q = build(q);
    const { count, error } = await q;
    if (error) return { count: null, error: error.message || String(error) };
    return { count: count || 0 };
  } catch (e) {
    return { count: null, error: e.message || String(e) };
  }
}

async function verifyCarePlan(manifest) {
  const checks = [];
  const { stress_tag: tag, care_plan_ids: planIds = [], provider_ids: providerIds = [], test_start_iso: testStartIso } = manifest;

  checks.push({
    scope: `care_plans WHERE title LIKE %${tag}%`,
    ...(await countMatching('care_plans', q => q.like('title', `%${tag}%`))),
    table: 'care_plans',
  });

  if (planIds.length > 0) {
    checks.push({
      scope: `plan_bids WHERE care_plan_id IN (${planIds.length} seeded)`,
      ...(await countMatching('plan_bids', q => q.in('care_plan_id', planIds))),
      table: 'plan_bids',
    });
    checks.push({
      scope: `care_plan_completions WHERE care_plan_id IN (${planIds.length} seeded)`,
      ...(await countMatching('care_plan_completions', q => q.in('care_plan_id', planIds))),
      table: 'care_plan_completions',
    });
    checks.push({
      scope: `agent_events WHERE payload->>care_plan_id IN (${planIds.length} seeded)`,
      ...(await countMatching('agent_events', q => q.in('payload->>care_plan_id', planIds.map(String)))),
      table: 'agent_events',
    });
  }

  if (providerIds.length > 0 && testStartIso) {
    checks.push({
      scope: `provider_alerts WHERE provider_id IN (${providerIds.length} seeded) AND created_at >= ${testStartIso}`,
      ...(await countMatching('provider_alerts', q => q.in('provider_id', providerIds).gte('created_at', testStartIso))),
      table: 'provider_alerts',
    });
  }
  return checks;
}

async function verifyBgcWebhook(manifest) {
  const checks = [];
  const {
    stress_tag: tag,
    report_ids: reportIds = [],
    check_ids: checkIds = [],
    provider_ids: providerIds = [],
    employee_ids: employeeIds = [],
    test_start_iso: testStartIso,
  } = manifest;

  checks.push({
    scope: `employee_background_checks WHERE bgc_report_id LIKE ${tag}-%`,
    ...(await countMatching('employee_background_checks', q => q.like('bgc_report_id', `${tag}-%`))),
    table: 'employee_background_checks',
  });

  if (reportIds.length > 0) {
    checks.push({
      scope: `agent_events WHERE event_type='provider.bgc_completed' AND payload->>bgc_report_id IN (${reportIds.length})`,
      ...(await countMatching('agent_events', q => q.eq('event_type', 'provider.bgc_completed').in('payload->>bgc_report_id', reportIds))),
      table: 'agent_events',
    });
  }

  if (checkIds.length > 0) {
    checks.push({
      scope: `provider_alerts WHERE bgc_check_id IN (${checkIds.length})`,
      ...(await countMatching('provider_alerts', q => q.in('bgc_check_id', checkIds))),
      table: 'provider_alerts',
    });
  }
  if (employeeIds.length > 0) {
    checks.push({
      scope: `provider_alerts WHERE employee_id IN (${employeeIds.length})`,
      ...(await countMatching('provider_alerts', q => q.in('employee_id', employeeIds))),
      table: 'provider_alerts',
    });
  }
  if (providerIds.length > 0 && testStartIso) {
    checks.push({
      scope: `provider_alerts WHERE provider_id IN (${providerIds.length}) AND created_at >= ${testStartIso}`,
      ...(await countMatching('provider_alerts', q => q.in('provider_id', providerIds).gte('created_at', testStartIso))),
      table: 'provider_alerts',
    });
  }
  return checks;
}

async function verifyBgcBroadcast(manifest) {
  const checks = [];
  const {
    stress_tag: tag,
    stress_domain: stressDomain,
    profile_ids: profileIds = [],
    emails = [],
    test_start_iso: testStartIso,
  } = manifest;

  if (stressDomain) {
    checks.push({
      scope: `profiles WHERE email LIKE %@${stressDomain}`,
      ...(await countMatching('profiles', q => q.like('email', `%@${stressDomain}`))),
      table: 'profiles',
    });
  }
  checks.push({
    scope: `profiles WHERE email LIKE stress-${tag}-%`,
    ...(await countMatching('profiles', q => q.like('email', `stress-${tag}-%`))),
    table: 'profiles',
  });
  if (profileIds.length > 0) {
    checks.push({
      scope: `profiles WHERE id IN (${profileIds.length} seeded)`,
      ...(await countMatching('profiles', q => q.in('id', profileIds))),
      table: 'profiles',
    });
  }
  if (emails.length > 0) {
    checks.push({
      scope: `email_unsubscribes WHERE email IN (${emails.length} seeded)`,
      ...(await countMatching('email_unsubscribes', q => q.in('email', emails))),
      table: 'email_unsubscribes',
    });
    checks.push({
      scope: `outreach_leads WHERE email IN (${emails.length} seeded)`,
      ...(await countMatching('outreach_leads', q => q.in('email', emails))),
      table: 'outreach_leads',
    });
  }
  checks.push({
    scope: `email_unsubscribes WHERE source='${tag}'`,
    ...(await countMatching('email_unsubscribes', q => q.eq('source', tag))),
    table: 'email_unsubscribes',
  });
  checks.push({
    scope: `outreach_leads WHERE source='${tag}'`,
    ...(await countMatching('outreach_leads', q => q.eq('source', tag))),
    table: 'outreach_leads',
  });
  if (testStartIso) {
    checks.push({
      scope: `agent_memory WHERE key LIKE %${tag}% AND created_at >= ${testStartIso}`,
      ...(await countMatching('agent_memory', q => q.like('key', `%${tag}%`).gte('created_at', testStartIso))),
      table: 'agent_memory',
    });
  } else {
    checks.push({
      scope: `agent_memory WHERE key LIKE %${tag}%`,
      ...(await countMatching('agent_memory', q => q.like('key', `%${tag}%`))),
      table: 'agent_memory',
    });
  }
  return checks;
}

async function verifySurvey(manifest) {
  const tag = manifest.stress_tag;
  return [{
    scope: `survey_responses WHERE email LIKE ${tag}-%`,
    ...(await countMatching('survey_responses', q => q.like('email', `${tag}-%`))),
    table: 'survey_responses',
  }];
}

async function verifyShop(manifest) {
  const checks = [];
  const { stress_tag: tag, merch_order_ids: orderIds = [] } = manifest;
  if (orderIds.length > 0) {
    checks.push({
      scope: `merch_orders WHERE id IN (${orderIds.length} seeded)`,
      ...(await countMatching('merch_orders', q => q.in('id', orderIds))),
      table: 'merch_orders',
    });
  }
  // Belt-and-braces: also scan recent orders for stress-tag-bearing items
  // in case orderIds was empty (no successful checkouts) but rows still
  // somehow leaked through.
  try {
    const since = new Date(Date.now() - 600000).toISOString();
    const { data: recent } = await supabase
      .from('merch_orders')
      .select('id, items')
      .gte('created_at', since)
      .limit(2000);
    const leftover = (recent || []).filter(o =>
      (Array.isArray(o.items) ? o.items : []).some(it => it && typeof it.name === 'string' && it.name.includes(tag))
    );
    checks.push({
      table: 'merch_orders',
      scope: `merch_orders (recent ≤10min) WHERE items[].name contains ${tag}`,
      count: leftover.length,
    });
  } catch (e) {
    checks.push({
      table: 'merch_orders',
      scope: `merch_orders (recent ≤10min) WHERE items[].name contains ${tag}`,
      count: null,
      error: e.message || String(e),
    });
  }
  return checks;
}

const VERIFIERS = {
  'care-plan-lifecycle': verifyCarePlan,
  'bgc-webhook': verifyBgcWebhook,
  'bgc-broadcast': verifyBgcBroadcast,
  'survey-intake': verifySurvey,
  'shop-checkout': verifyShop,
};

function fmt(n) {
  return String(n).padStart(5, ' ');
}

async function main() {
  console.log('========================================================');
  console.log('  Task #396 — Stress-Test Cleanup Verifier');
  console.log(`  concurrency=${CONCURRENCY}  duration=${DURATION}s`);
  console.log('========================================================');

  const results = [];
  let anyFail = false;

  for (const test of TESTS) {
    const stressTag = freshTag(test.tagPrefix);
    const manifestPath = tmpManifestPath(test.label);
    console.log('');
    console.log('--------------------------------------------------------');
    console.log(`  ▶ ${test.label}`);
    console.log(`    STRESS_TAG=${stressTag}`);
    console.log(`    STRESS_MANIFEST_FILE=${manifestPath}`);
    console.log('--------------------------------------------------------');

    const start = Date.now();
    const run = spawnTest(test, stressTag, manifestPath);
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(run.combined);
    console.log('');
    console.log(`  [${test.label}] exit=${run.exitCode} status=${run.status} elapsed=${elapsed}s`);

    let leftoverChecks = [];
    let verifyError = null;
    if (run.status === 'FAIL') {
      // Even on test failure, attempt to read the manifest so any partial
      // cleanup leftovers surface in the summary.
      verifyError = `stress test exited ${run.exitCode}`;
      anyFail = true;
    }

    const manifest = readManifest(manifestPath);
    if (!manifest) {
      if (run.status === 'SKIPPED') {
        // Test self-skipped before cleanup ran — nothing was seeded, so
        // there's nothing to verify.
        results.push({ test: test.label, status: 'SKIPPED', elapsed, checks: [], note: 'no manifest (test skipped before seeding)' });
        // Cleanup manifest path (may not exist).
        try { fs.unlinkSync(manifestPath); } catch {}
        continue;
      }
      results.push({
        test: test.label,
        status: 'FAIL',
        elapsed,
        checks: [],
        note: `manifest missing at ${manifestPath} (stress test never reached cleanup?)`,
      });
      anyFail = true;
      try { fs.unlinkSync(manifestPath); } catch {}
      continue;
    }
    if (manifest._readError) {
      results.push({ test: test.label, status: 'FAIL', elapsed, checks: [], note: `manifest read error: ${manifest._readError}` });
      anyFail = true;
      try { fs.unlinkSync(manifestPath); } catch {}
      continue;
    }

    try {
      leftoverChecks = await VERIFIERS[test.label](manifest);
    } catch (e) {
      verifyError = `verifier threw: ${e.message || e}`;
    }

    const leftoverRows = leftoverChecks.filter(c => typeof c.count === 'number' && c.count > 0);
    // A query that errored out (bad column path, PostgREST cast quirk,
    // missing table where we expected one) means we did NOT actually
    // prove cleanup — treat it as hard failure. Otherwise a future
    // regression that breaks the filter could pass this script silently,
    // which is precisely the failure mode Task #396 exists to prevent.
    const queryErrors = leftoverChecks.filter(c => c.error);

    let status = run.status;
    const failed = leftoverRows.length > 0 || queryErrors.length > 0 || verifyError;
    if (status === 'PASS' && failed) status = 'FAIL';
    if (failed) anyFail = true;

    results.push({
      test: test.label,
      status,
      elapsed,
      checks: leftoverChecks,
      leftoverRows,
      queryErrors,
      note: verifyError,
    });

    try { fs.unlinkSync(manifestPath); } catch {}
  }

  console.log('');
  console.log('========================================================');
  console.log('  Cleanup Verification Summary');
  console.log('========================================================');
  for (const r of results) {
    console.log('');
    console.log(`  ${r.test}  [${r.status}]  (${r.elapsed}s)`);
    if (r.note) console.log(`    note: ${r.note}`);
    if (r.checks && r.checks.length > 0) {
      for (const c of r.checks) {
        const countStr = c.count === null ? '  err' : fmt(c.count);
        const ok = c.count === 0 ? '✓' : (c.count === null ? '✗' : '✗');
        console.log(`    ${ok} ${countStr}  ${c.table.padEnd(30)} ${c.scope}`);
        if (c.error) console.log(`         QUERY ERROR (treated as FAIL): ${c.error}`);
      }
    } else if (r.status !== 'SKIPPED') {
      console.log('    (no verification checks ran)');
    }
    if (r.queryErrors && r.queryErrors.length > 0) {
      console.log(`    ${r.queryErrors.length} verification quer${r.queryErrors.length === 1 ? 'y' : 'ies'} failed — cleanup NOT proven for this test.`);
    }
  }

  console.log('');
  console.log('========================================================');
  if (anyFail) {
    const failed = results.filter(r => r.status === 'FAIL').map(r => r.test);
    console.log(`  ✗ Cleanup verification FAILED for: ${failed.join(', ')}`);
    console.log('========================================================');
    process.exit(1);
  }
  console.log('  ✓ All stress-test cleanups left zero leftover rows.');
  console.log('========================================================');
  process.exit(0);
}

main().catch(e => {
  console.error('Verifier crashed:', e);
  process.exit(2);
});
