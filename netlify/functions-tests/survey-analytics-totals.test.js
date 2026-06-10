#!/usr/bin/env node
// ============================================================================
// survey-analytics totals consistency — regression test (Task #393)
//
// Task #226 fixed a bug where the survey admin chart percentages disagreed
// with the headline once the survey_responses table crossed 1000 rows: the
// headline `total` had been bounded by the same `.limit(1000)` used to pull
// the chart sample, so the buckets summed to a different (smaller) number
// than the headline once real volume arrived. That fix had no automated
// regression coverage. This test seeds >1000 fake rows into an in-memory
// supabase stub, runs the shared `computeSurveyAnalytics` helper that
// www/server.js calls from /api/admin/survey-analytics, and asserts:
//
//   • the headline `total` reflects the *true* row count (NOT capped at the
//     1000-row chart sample) — catches re-introduction of `.limit()` on the
//     count query
//   • for every `by_*` breakdown, the sum of bucket values equals the count
//     of non-null rows in the sample (never exceeds the sample size and is
//     internally consistent with `total`)
//   • the sample is itself capped at the configured sample limit (1000)
//
// Pure in-memory, no live creds. Run via:
//   node netlify/functions-tests/survey-analytics-totals.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const path = require('path');

const {
  SURVEY_ANALYTICS_KEYS,
  DEFAULT_SAMPLE_LIMIT,
  computeSurveyAnalytics
} = require(path.resolve(__dirname, '../../lib/survey-analytics'));

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log('       ' + String((err && err.stack) || err).split('\n').join('\n       '));
    failed++;
  }
}

// ---------------------------------------------------------------------------
// In-memory supabase stub that simulates a single `survey_responses` table
// and supports the two query shapes used by the analytics helper:
//   1. .select('*', { count: 'exact', head: true })  → { count, error }
//   2. .select(cols).order(col, opts).limit(n)       → { data, error }
// ---------------------------------------------------------------------------
function makeSupabase(rows, { countOverride, sampleError, countError } = {}) {
  return {
    from(table) {
      assert.strictEqual(table, 'survey_responses', 'helper queried unexpected table');
      let head = false;
      let orderCol = null;
      let orderAsc = true;
      let limitN = null;
      const builder = {
        select(_cols, opts) {
          if (opts && opts.head) head = true;
          return builder;
        },
        order(col, opts) { orderCol = col; orderAsc = !!(opts && opts.ascending); return builder; },
        limit(n) { limitN = n; return builder; },
        then(resolve, reject) {
          return Promise.resolve(builder._exec()).then(resolve, reject);
        },
        _exec() {
          if (head) {
            if (countError) return { count: null, error: countError };
            const c = typeof countOverride === 'number' ? countOverride : rows.length;
            return { count: c, error: null };
          }
          if (sampleError) return { data: null, error: sampleError };
          let out = rows.slice();
          if (orderCol) {
            out.sort((a, b) => {
              const av = a[orderCol], bv = b[orderCol];
              if (av === bv) return 0;
              return (av > bv ? 1 : -1) * (orderAsc ? 1 : -1);
            });
          }
          if (typeof limitN === 'number') out = out.slice(0, limitN);
          return { data: out, error: null };
        }
      };
      return builder;
    }
  };
}

function seedRows(n) {
  // Three top_priority buckets + a few rows with null to confirm we don't
  // accidentally count nulls.
  const priorities = ['price', 'trust', 'convenience'];
  const frequencies = ['monthly', 'quarterly', 'annually'];
  const rows = [];
  const base = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) {
    const isNullPriority = i % 50 === 0; // ~2% null
    rows.push({
      // newest-first ordering is by created_at desc — make i=n-1 the newest
      created_at: new Date(base + i * 60_000).toISOString(),
      top_priority: isNullPriority ? null : priorities[i % priorities.length],
      service_frequency: frequencies[i % frequencies.length],
      provider_discovery: i % 7 === 0 ? null : 'google',
      provider_satisfaction: null,
      service_types: null,
      pricing_confidence: null,
      estimate_surprise: null,
      quote_behavior: null,
      provider_honesty: null,
      provider_vetting: null,
      history_tracking: null,
      maintenance_avoidance: null,
      job_status_updates: null,
      maintenance_reminders: null,
      competitive_bids: null,
      app_usage: null,
      payment_comfort: null,
      dispute_history: null,
      annual_spend: null,
      decision_maker: null,
      near_term_need: null,
      vehicle_count: null
    });
  }
  return rows;
}

function sumBucket(bucket) {
  return Object.values(bucket || {}).reduce((s, n) => s + n, 0);
}

async function main() {
  console.log('survey-analytics totals consistency (Task #393)');

  await check('headline `total` reflects TRUE row count when table exceeds the chart sample (>1000 rows)', async () => {
    const seeded = 1500;
    const supabase = makeSupabase(seedRows(seeded));
    const { payload, error } = await computeSurveyAnalytics(supabase);
    assert.ok(!error, 'helper returned an error: ' + JSON.stringify(error));
    assert.strictEqual(payload.total, seeded,
      `total must equal true row count (${seeded}); got ${payload.total}. ` +
      'Did someone add .limit() to the count query?');
    assert.strictEqual(payload.schema_pending, false);
  });

  await check('chart sample is capped at the configured limit (1000) even with >1000 rows', async () => {
    const seeded = 1500;
    const supabase = makeSupabase(seedRows(seeded));
    const { payload } = await computeSurveyAnalytics(supabase);
    assert.strictEqual(payload.sample_size, DEFAULT_SAMPLE_LIMIT,
      `sample_size must equal DEFAULT_SAMPLE_LIMIT (${DEFAULT_SAMPLE_LIMIT}); got ${payload.sample_size}`);
  });

  await check('every `by_*` bucket-sum equals the count of non-null rows in the sample and never exceeds the sample size', async () => {
    const seeded = 1500;
    const rows = seedRows(seeded);
    const supabase = makeSupabase(rows);
    const { payload } = await computeSurveyAnalytics(supabase);

    // Reproduce the newest-first sample the helper saw so we can compute
    // per-key expected sums from the SAME 1000 rows.
    const sample = rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, DEFAULT_SAMPLE_LIMIT);

    for (const k of SURVEY_ANALYTICS_KEYS) {
      const bucket = payload['by_' + k];
      assert.ok(bucket && typeof bucket === 'object', `missing by_${k} bucket`);
      const sum = sumBucket(bucket);
      const expected = sample.filter(r => r[k]).length;
      assert.strictEqual(sum, expected,
        `sum(by_${k}) must equal non-null sample count (${expected}); got ${sum}. ` +
        'If this drifts, the chart and headline no longer agree (Task #226 regression).');
      assert.ok(sum <= payload.sample_size,
        `sum(by_${k})=${sum} exceeds sample_size=${payload.sample_size}`);
      assert.ok(sum <= payload.total,
        `sum(by_${k})=${sum} exceeds headline total=${payload.total}`);
    }
  });

  await check('with rows < sample limit, every fully-populated `by_*` bucket-sum equals headline total', async () => {
    const seeded = 50;
    const rows = seedRows(seeded);
    const supabase = makeSupabase(rows);
    const { payload } = await computeSurveyAnalytics(supabase);
    assert.strictEqual(payload.total, seeded);
    // service_frequency is populated on every seeded row, so its bucket-sum
    // must equal the headline total exactly.
    assert.strictEqual(sumBucket(payload.by_service_frequency), seeded,
      'sum(by_service_frequency) must equal total when every row has the field populated');
  });

  await check('soft empty state when survey_responses table missing (42P01)', async () => {
    const supabase = makeSupabase([], { countError: { code: '42P01', message: 'relation does not exist' } });
    const { payload, error } = await computeSurveyAnalytics(supabase);
    assert.ok(!error);
    assert.strictEqual(payload.schema_pending, true);
    assert.strictEqual(payload.total, 0);
    assert.strictEqual(payload.sample_size, 0);
  });

  await check('soft empty state when a survey column is missing (PGRST204)', async () => {
    const supabase = makeSupabase(seedRows(5), {
      sampleError: { code: 'PGRST204', message: "Could not find the 'top_priority' column in schema cache" }
    });
    const { payload, error } = await computeSurveyAnalytics(supabase);
    assert.ok(!error);
    assert.strictEqual(payload.schema_pending, true);
    // headline count still resolved from the separate count query
    assert.strictEqual(payload.total, 5);
  });

  await check('unrelated DB error on count is surfaced (not silently swallowed)', async () => {
    const supabase = makeSupabase([], { countError: { code: '42501', message: 'permission denied' } });
    const { payload, error } = await computeSurveyAnalytics(supabase);
    assert.ok(!payload, 'payload should be undefined when surfacing a hard error');
    assert.ok(error);
    assert.strictEqual(error.code, '42501');
  });

  console.log('');
  console.log(`survey-analytics totals: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
