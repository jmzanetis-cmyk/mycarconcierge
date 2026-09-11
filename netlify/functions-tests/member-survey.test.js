// ============================================================================
// Tests for POST /api/member/survey (netlify/functions/member-survey.js).
//
// Written 2026-09-11 while chasing down Jordan's "post-signup survey
// silently 404s / every column is NULL in prod" report. The endpoint and
// its www/_redirects rule both actually exist (ported in bb1c402) -- the
// real bug is one level deeper: the handler upserts with
// { onConflict: 'user_id' }, but survey_responses has only ever had a
// *non-unique* index on user_id (20260328_member_onboarding.sql). Postgres
// requires a unique constraint/index matching the ON CONFLICT target, so
// every real call has been failing at the DB layer (42P10) since the
// endpoint shipped. www/onboarding-member.html's submitSurveyAndClose()
// only console.warn()s on failure and always shows the thank-you screen
// regardless -- hence "silently". Fixed by
// supabase/migrations/20260911_survey_responses_user_id_unique.sql.
//
// The handler-logic tests below stub Supabase entirely, so they verify the
// JS-level contract (validation, auth, upsert shape) but -- by design --
// cannot catch the missing-unique-index bug itself, since a stub happily
// accepts any onConflict value. The last two tests are static/regression
// guards against exactly that class of bug: they assert the unique index
// actually exists in the migrations and that the redirect is wired up, so
// this can't silently regress again.
//
// Run with: node netlify/functions-tests/member-survey.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('module');

let testsRun = 0;
let testsFailed = 0;
async function run(name, fn) {
  testsRun++;
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  FAIL ${name}\n       ${err.stack || err.message}`);
  }
}

// ── module stub for @supabase/supabase-js ────────────────────────────────
const origLoad = Module._load;
let currentSupabase = null;
Module._load = function (request, parent, ...rest) {
  if (request === '@supabase/supabase-js') return { createClient: () => currentSupabase };
  return origLoad.call(this, request, parent, ...rest);
};

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

function freshHandler() {
  const modPath = require.resolve('../functions/member-survey');
  delete require.cache[modPath];
  return require(modPath).handler;
}

function makeSupabase({ user = { id: 'user-1' }, userErr = null, upsertErr = null, onUpsert } = {}) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: userErr }),
    },
    from(table) {
      assert.strictEqual(table, 'survey_responses');
      return {
        upsert(row, opts) {
          if (onUpsert) onUpsert(row, opts);
          return Promise.resolve({ data: null, error: upsertErr });
        },
      };
    },
  };
}

function postEvent(body, headers) {
  return {
    httpMethod: 'POST',
    headers: Object.assign({ authorization: 'Bearer tok' }, headers || {}),
    body: typeof body === 'string' ? body : JSON.stringify(body || {}),
  };
}

(async () => {
  await run('happy path: valid answers upsert with onConflict: user_id, 200', async () => {
    let captured;
    currentSupabase = makeSupabase({ onUpsert: (row, opts) => { captured = { row, opts }; } });
    const handler = freshHandler();
    const res = await handler(postEvent({ provider_discovery: 'word_of_mouth', top_priority: 'trust' }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(JSON.parse(res.body).success, true);
    assert.strictEqual(captured.opts.onConflict, 'user_id');
    assert.strictEqual(captured.row.user_id, 'user-1');
    assert.strictEqual(captured.row.provider_discovery, 'word_of_mouth');
    assert.strictEqual(captured.row.top_priority, 'trust');
    // Unanswered keys are written as null, not omitted -- so a resubmit
    // clears any prior partial answer instead of leaving it stale.
    assert.strictEqual(captured.row.service_frequency, null);
  });

  await run('invalid enum value for a known key returns 400', async () => {
    currentSupabase = makeSupabase();
    const handler = freshHandler();
    const res = await handler(postEvent({ provider_discovery: 'not_a_real_option' }));
    assert.strictEqual(res.statusCode, 400);
  });

  await run('missing Authorization header returns 401', async () => {
    currentSupabase = makeSupabase();
    const handler = freshHandler();
    const res = await handler(postEvent({}, { authorization: '' }));
    assert.strictEqual(res.statusCode, 401);
  });

  await run('invalid/expired token returns 401', async () => {
    currentSupabase = makeSupabase({ user: null, userErr: { message: 'invalid' } });
    const handler = freshHandler();
    const res = await handler(postEvent({}));
    assert.strictEqual(res.statusCode, 401);
  });

  await run('non-POST method returns 405', async () => {
    currentSupabase = makeSupabase();
    const handler = freshHandler();
    const res = await handler({ httpMethod: 'GET', headers: {} });
    assert.strictEqual(res.statusCode, 405);
  });

  await run('OPTIONS preflight returns 200', async () => {
    currentSupabase = makeSupabase();
    const handler = freshHandler();
    const res = await handler({ httpMethod: 'OPTIONS', headers: {} });
    assert.strictEqual(res.statusCode, 200);
  });

  await run('a DB error from upsert surfaces as 500, not a silent 200', async () => {
    currentSupabase = makeSupabase({
      upsertErr: { message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' },
    });
    const handler = freshHandler();
    const res = await handler(postEvent({ top_priority: 'trust' }));
    assert.strictEqual(res.statusCode, 500);
  });

  // ---------------------------------------------------------------------
  // Regression guards for the actual production bug (see file header).
  // The handler-logic tests above stub Supabase entirely and so cannot
  // catch a missing DB-level unique constraint -- assert directly against
  // the repo's migration + redirect wiring instead.
  // ---------------------------------------------------------------------
  await run('a migration creates a UNIQUE index on survey_responses(user_id)', () => {
    const migDir = path.resolve(__dirname, '..', '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    const combined = files.map((f) => fs.readFileSync(path.join(migDir, f), 'utf8')).join('\n');
    assert.ok(
      /CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+survey_responses\s*\(\s*user_id\s*\)/i.test(combined),
      'No migration creates a UNIQUE index on survey_responses(user_id) -- '
        + "member-survey.js's upsert({...}, { onConflict: 'user_id' }) will "
        + 'fail at the database layer (42P10) without one.',
    );
  });

  await run('www/_redirects maps /api/member/survey to the member-survey function', () => {
    const redirectsPath = path.resolve(__dirname, '..', '..', 'www', '_redirects');
    const src = fs.readFileSync(redirectsPath, 'utf8');
    assert.ok(
      /^\s*\/api\/member\/survey\s+\/\.netlify\/functions\/member-survey\s+200/m.test(src),
      'Missing /api/member/survey redirect to /.netlify/functions/member-survey',
    );
    const handlerPath = path.resolve(__dirname, '..', 'functions', 'member-survey.js');
    assert.ok(fs.existsSync(handlerPath), `Handler file missing: ${handlerPath}`);
  });

  Module._load = origLoad;
  console.log(`\n${testsRun - testsFailed} passed, ${testsFailed} failed`);
  process.exit(testsFailed === 0 ? 0 : 1);
})();
