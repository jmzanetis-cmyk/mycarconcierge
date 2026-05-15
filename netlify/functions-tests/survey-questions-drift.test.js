#!/usr/bin/env node
// Task #232 — Guardrail: catch drift in the post-signup member survey list.
//
// Background: Task #169 collapsed the 22-question member-survey list into a
// single shared module (`www/shared/survey-questions.js`) so that the signup
// form, the POST /api/member/survey validator, and the admin chart labels
// can no longer drift apart. There is, however, no automated check that
// guarantees a future contributor doesn't quietly:
//   • drop a question (KEYS.length shrinks below 22),
//   • ship a question with no answer options,
//   • introduce a duplicate `val` inside a single question, or
//   • re-introduce a parallel hand-rolled list of question keys somewhere
//     else in `www/` (the original Task #166 regression).
//
// This test asserts the structural invariants of the shared module and
// verifies that the one known parallel list of survey keys (the
// `CHART_KEYS` array inside `www/admin.js`, which controls which dimension
// charts get rendered on the admin dashboard) is the *same set* as
// `MCCSurvey.KEYS`. If anyone adds or removes a question in the shared
// file without updating the admin chart loop, this test fails loudly
// instead of silently dropping a chart from the dashboard.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SHARED_PATH = path.join(REPO_ROOT, 'www', 'shared', 'survey-questions.js');
const ADMIN_JS_PATH = path.join(REPO_ROOT, 'www', 'admin.js');

// Bumping this requires intentionally updating the test alongside the
// shared file — exactly the "did you mean to change the survey?" prompt
// we want a future contributor to face.
const EXPECTED_KEY_COUNT = 22;

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL ${name}`);
    if (detail) console.log('       ' + String(detail).split('\n').join('\n       '));
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. Load the shared module and assert structural invariants.
// ---------------------------------------------------------------------------
const MCCSurvey = require(SHARED_PATH);

check(
  'MCCSurvey exports QUESTIONS, KEYS, ALLOWED, LABELS',
  Array.isArray(MCCSurvey.QUESTIONS)
    && Array.isArray(MCCSurvey.KEYS)
    && MCCSurvey.ALLOWED && typeof MCCSurvey.ALLOWED === 'object'
    && MCCSurvey.LABELS && typeof MCCSurvey.LABELS === 'object',
  'Shared module is missing one of the required named exports.',
);

check(
  `KEYS.length === ${EXPECTED_KEY_COUNT}`,
  MCCSurvey.KEYS.length === EXPECTED_KEY_COUNT,
  `Got ${MCCSurvey.KEYS.length} keys. If you intentionally added or removed a `
    + `survey question, bump EXPECTED_KEY_COUNT in this test to match.`,
);

const seenKeys = new Set();
let allQuestionsValid = true;
const questionFailures = [];

for (const q of MCCSurvey.QUESTIONS) {
  if (!q || typeof q.key !== 'string' || !q.key.length) {
    allQuestionsValid = false;
    questionFailures.push('Question missing a string `key`: ' + JSON.stringify(q));
    continue;
  }
  if (seenKeys.has(q.key)) {
    allQuestionsValid = false;
    questionFailures.push(`Duplicate question key: ${q.key}`);
  }
  seenKeys.add(q.key);

  if (!Array.isArray(q.opts) || q.opts.length === 0) {
    allQuestionsValid = false;
    questionFailures.push(`Question "${q.key}" has empty/missing opts array`);
    continue;
  }

  const seenVals = new Set();
  for (const o of q.opts) {
    if (!o || typeof o.val !== 'string' || !o.val.length) {
      allQuestionsValid = false;
      questionFailures.push(`Question "${q.key}" has an option with no string val: ${JSON.stringify(o)}`);
      continue;
    }
    if (seenVals.has(o.val)) {
      allQuestionsValid = false;
      questionFailures.push(`Question "${q.key}" has duplicate val "${o.val}"`);
    }
    seenVals.add(o.val);
    if (typeof o.label !== 'string' || !o.label.length) {
      allQuestionsValid = false;
      questionFailures.push(`Question "${q.key}" option "${o.val}" has empty label`);
    }
  }
}

check(
  'every question has a unique key, non-empty opts, and unique non-empty vals with labels',
  allQuestionsValid,
  questionFailures.join('\n'),
);

// ALLOWED must include every val plus '' (the unanswered sentinel) and must
// not contain any extra keys the form won't render.
let allowedOk = true;
const allowedFailures = [];
for (const q of MCCSurvey.QUESTIONS) {
  const list = MCCSurvey.ALLOWED[q.key];
  if (!Array.isArray(list)) {
    allowedOk = false;
    allowedFailures.push(`ALLOWED["${q.key}"] is not an array`);
    continue;
  }
  if (!list.includes('')) {
    allowedOk = false;
    allowedFailures.push(`ALLOWED["${q.key}"] is missing the '' (unanswered) sentinel`);
  }
  for (const o of q.opts) {
    if (!list.includes(o.val)) {
      allowedOk = false;
      allowedFailures.push(`ALLOWED["${q.key}"] is missing val "${o.val}"`);
    }
  }
}
const allowedKeyDelta = Object.keys(MCCSurvey.ALLOWED).filter(k => !seenKeys.has(k));
if (allowedKeyDelta.length) {
  allowedOk = false;
  allowedFailures.push('ALLOWED has extra keys not in QUESTIONS: ' + allowedKeyDelta.join(', '));
}
check(
  'ALLOWED map is in sync with QUESTIONS (every val + "" present, no extra keys)',
  allowedOk,
  allowedFailures.join('\n'),
);

// LABELS must cover every key/val so the admin chart never falls back to
// raw enum strings for a known option.
let labelsOk = true;
const labelFailures = [];
for (const q of MCCSurvey.QUESTIONS) {
  const map = MCCSurvey.LABELS[q.key];
  if (!map || typeof map !== 'object') {
    labelsOk = false;
    labelFailures.push(`LABELS["${q.key}"] is missing`);
    continue;
  }
  for (const o of q.opts) {
    if (typeof map[o.val] !== 'string' || !map[o.val].length) {
      labelsOk = false;
      labelFailures.push(`LABELS["${q.key}"]["${o.val}"] is missing or empty`);
    }
  }
}
check(
  'LABELS map covers every (key, val) pair with a non-empty string',
  labelsOk,
  labelFailures.join('\n'),
);

// ---------------------------------------------------------------------------
// 2. Drift check: the admin dashboard's CHART_KEYS array must be the same
//    *set* as MCCSurvey.KEYS. If a future change adds a question to the
//    shared file but forgets to render its chart (or removes a question
//    without dropping the dead chart card), this test fails.
// ---------------------------------------------------------------------------
const adminSrc = fs.readFileSync(ADMIN_JS_PATH, 'utf8');
const chartKeysMatch = adminSrc.match(/const\s+CHART_KEYS\s*=\s*\[([\s\S]*?)\]/);

check(
  'admin.js still declares the CHART_KEYS array',
  Boolean(chartKeysMatch),
  'Could not find `const CHART_KEYS = [ … ]` in www/admin.js. If the dashboard '
    + 'was refactored, update this test to point at the new declaration.',
);

if (chartKeysMatch) {
  const chartKeys = Array.from(chartKeysMatch[1].matchAll(/'([^']+)'|"([^"]+)"/g))
    .map(m => m[1] || m[2]);
  const sharedSet = new Set(MCCSurvey.KEYS);
  const chartSet = new Set(chartKeys);
  const missing = MCCSurvey.KEYS.filter(k => !chartSet.has(k));
  const extra = chartKeys.filter(k => !sharedSet.has(k));

  check(
    'admin.js CHART_KEYS matches MCCSurvey.KEYS as a set',
    missing.length === 0 && extra.length === 0,
    [
      missing.length ? 'Missing from admin.js CHART_KEYS: ' + missing.join(', ') : '',
      extra.length ? 'Extra in admin.js CHART_KEYS (not in shared file): ' + extra.join(', ') : '',
      'If you added or removed a survey question in www/shared/survey-questions.js, '
        + 'update the CHART_KEYS array (and the matching <canvas id="ms-chart-…"> '
        + 'cards in www/admin.html) so the dashboard renders the new dimension.',
    ].filter(Boolean).join('\n'),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
