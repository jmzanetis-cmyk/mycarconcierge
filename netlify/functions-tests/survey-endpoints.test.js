#!/usr/bin/env node
// ============================================================================
// survey-endpoints smoke tests (Task #345)
//
// Task #343 ported four /api/survey/* handlers from www/server.js into
// netlify/functions/ after they had silently 404'd in prod since the
// shadow-tree deletion in Task #208. This file is the regression net so the
// same drift can't happen again: each handler is exercised in-process here,
// and every /api/survey/* line in www/_redirects is asserted so a missing
// redirect surfaces as a test failure instead of a live 404.
//
// Coverage per handler:
//   • happy path (200 + expected response shape) with a stub Supabase
//   • graceful-degrade when utils.createSupabaseClient() returns null
//     (mirrors the dev parity behaviour the handlers all rely on)
//   • per-IP rate limit 429 after exceeding the public-tier cap
//
// Plus a parity check on www/_redirects so each survey-* function has a
// matching /api/survey/* rule.
//
// Run with:  node netlify/functions-tests/survey-endpoints.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  ok  ${name}`);
        passed++;
      }, (err) => {
        console.log(`  FAIL ${name}`);
        console.log('       ' + String((err && err.stack) || err).split('\n').join('\n       '));
        failed++;
      });
    }
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log('       ' + String((err && err.stack) || err).split('\n').join('\n       '));
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Supabase stub. Each handler invocation sets supabaseImpl to script returns.
// Setting supabaseImpl=null exercises the "Supabase misconfigured" path.
// ---------------------------------------------------------------------------

let supabaseImpl = null;

function makeChain(table) {
  const ops = supabaseImpl && supabaseImpl[table] || {};
  const filters = {};
  let pendingPayload = null;
  let pendingOp = null;
  const chain = {
    select() { return chain; },
    eq(col, val) { filters[col] = val; return chain; },
    is() { return chain; },
    maybeSingle() {
      const fn = ops.maybeSingle;
      return Promise.resolve(fn ? fn(filters, pendingOp, pendingPayload) : { data: null, error: null });
    },
    single() {
      const fn = ops.single;
      return Promise.resolve(fn ? fn(filters, pendingOp, pendingPayload) : { data: null, error: null });
    },
    insert(rows) {
      pendingOp = 'insert';
      pendingPayload = rows;
      const fn = ops.insert;
      const result = fn ? fn(rows) : { data: null, error: null };
      // insert may or may not be chained with .select().single(); support both.
      chain.__terminalResult = result;
      return chain;
    },
    update(row) {
      pendingOp = 'update';
      pendingPayload = row;
      const fn = ops.update;
      const result = fn ? fn(row, filters) : { data: null, error: null };
      chain.__terminalResult = result;
      return chain;
    },
    then(resolve, reject) {
      const fallback = chain.__terminalResult || { data: null, error: null };
      return Promise.resolve(fallback).then(resolve, reject);
    },
  };
  return chain;
}

const supabaseStub = {
  from(table) { return makeChain(table); },
  auth: { admin: { createUser: async () => ({ data: { user: { id: 'stub-user' } }, error: null }) } },
};

// Patch utils.createSupabaseClient before requiring any handler so all
// four modules pick up the stub. The handlers call createSupabaseClient()
// on every invocation, so toggling supabaseImpl between tests works.
const utils = require('../functions/utils');
utils.createSupabaseClient = function () {
  return supabaseImpl === null ? null : supabaseStub;
};

// ---------------------------------------------------------------------------
// Helper: load a handler with a fresh module cache so rate-limit Maps reset
// between tests. Each test that exercises rate limiting calls freshHandler().
// ---------------------------------------------------------------------------
function freshHandler(name) {
  const modPath = require.resolve('../functions/' + name);
  delete require.cache[modPath];
  return require(modPath).handler;
}

function postEvent(body, headers) {
  return {
    httpMethod: 'POST',
    headers: Object.assign({ 'x-forwarded-for': '203.0.113.10' }, headers || {}),
    body: typeof body === 'string' ? body : JSON.stringify(body || {}),
  };
}

function getEvent(query, headers) {
  return {
    httpMethod: 'GET',
    headers: Object.assign({ 'x-forwarded-for': '203.0.113.20' }, headers || {}),
    queryStringParameters: query || {},
  };
}

async function exhaustRateLimit(handler, eventFactory) {
  // Public-tier limit is 30 req / 60 s. Fire 30 to fill, then the 31st 429s.
  for (let i = 0; i < 30; i++) {
    // eslint-disable-next-line no-await-in-loop
    await handler(eventFactory());
  }
  return handler(eventFactory());
}

// ===========================================================================
// survey-response
// ===========================================================================

async function testSurveyResponse() {
  console.log('survey-response');

  await check('happy-path insert returns 200 with id from Supabase', async () => {
    supabaseImpl = {
      survey_responses: {
        single: () => ({ data: { id: 'row-abc' }, error: null }),
      },
    };
    const handler = freshHandler('survey-response');
    const res = await handler(postEvent({ email: 'a@b.co', interested: true, session_id: 's1' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.id, 'row-abc');
  });

  await check('happy-path update with response_id returns 200 echoing the id', async () => {
    supabaseImpl = { survey_responses: { update: () => ({ data: null, error: null }) } };
    const handler = freshHandler('survey-response');
    const res = await handler(postEvent({ response_id: 'row-xyz', email: 'c@d.co' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.id, 'row-xyz');
  });

  await check('graceful-degrade: Supabase null still returns 200 with id:null', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-response');
    const res = await handler(postEvent({ email: 'a@b.co' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.id, null);
  });

  await check('per-IP rate limit returns 429 after exceeding the cap', async () => {
    supabaseImpl = null; // doesn't matter — handler is rejected before DB
    const handler = freshHandler('survey-response');
    const res = await exhaustRateLimit(handler, () => postEvent({ email: 'a@b.co' }));
    assert.strictEqual(res.statusCode, 429);
    assert.ok(res.headers['Retry-After']);
  });
}

// ===========================================================================
// survey-abandoned
// ===========================================================================

async function testSurveyAbandoned() {
  console.log('survey-abandoned');

  await check('happy-path with email returns 200 ok:true', async () => {
    supabaseImpl = {
      abandoned_signups: {
        maybeSingle: () => ({ data: null, error: null }),
        insert: () => ({ data: null, error: null }),
      },
      survey_responses: { update: () => ({ data: null, error: null }) },
    };
    const handler = freshHandler('survey-abandoned');
    const res = await handler(postEvent({ email: 'drop@off.co', response_id: 'r-1', first_name: 'Pat' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.ok(!body.skipped);
  });

  await check('no-email payload returns 200 skipped:no_email (not 4xx)', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-abandoned');
    const res = await handler(postEvent({ first_name: 'Anon' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.skipped, 'no_email');
  });

  await check('graceful-degrade: Supabase null still returns 200 ok:true with email', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-abandoned');
    const res = await handler(postEvent({ email: 'drop@off.co' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
  });

  await check('per-IP rate limit returns 429 after exceeding the cap', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-abandoned');
    const res = await exhaustRateLimit(handler, () => postEvent({ email: 'a@b.co' }));
    assert.strictEqual(res.statusCode, 429);
    assert.ok(res.headers['Retry-After']);
  });
}

// ===========================================================================
// survey-area-check
// ===========================================================================

async function testSurveyAreaCheck() {
  console.log('survey-area-check');

  await check('happy-path live ZIP returns 200 live:true', async () => {
    supabaseImpl = {
      live_service_areas: {
        maybeSingle: () => ({ data: { zip: '10001' }, error: null }),
      },
    };
    const handler = freshHandler('survey-area-check');
    const res = await handler(getEvent({ zip: '10001' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.live, true);
    assert.strictEqual(body.zip, '10001');
    assert.ok(/live in your area/i.test(body.message));
  });

  await check('ZIP not in live_service_areas returns 200 live:false with waitlist copy', async () => {
    supabaseImpl = {
      live_service_areas: {
        maybeSingle: () => ({ data: null, error: null }),
      },
    };
    const handler = freshHandler('survey-area-check');
    const res = await handler(getEvent({ zip: '99999' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.live, false);
    assert.ok(/waitlist/i.test(body.message));
  });

  await check('graceful-degrade: Supabase null returns 200 live:false (pre-launch)', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-area-check');
    const res = await handler(getEvent({ zip: '10001' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.live, false);
    assert.ok(/waitlist/i.test(body.message));
  });

  await check('missing zip returns 400', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-area-check');
    const res = await handler(getEvent({}));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('per-IP rate limit returns 429 after exceeding the cap', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-area-check');
    const res = await exhaustRateLimit(handler, () => getEvent({ zip: '10001' }));
    assert.strictEqual(res.statusCode, 429);
    assert.ok(res.headers['Retry-After']);
  });
}

// ===========================================================================
// survey-referral-link
// ===========================================================================

async function testSurveyReferralLink() {
  console.log('survey-referral-link');

  await check('happy-path generates a fresh referral code and URL', async () => {
    let referralsInsertCount = 0;
    supabaseImpl = {
      customer_profiles: {
        maybeSingle: () => ({ data: { auth_user_id: null }, error: null }),
        update: () => ({ data: null, error: null }),
      },
      profiles: {
        // existing auth user found via profiles → skip shadow-user creation
        maybeSingle: () => ({ data: { id: 'auth-user-123' }, error: null }),
      },
      referrals: {
        maybeSingle: () => ({ data: null, error: null }), // no duplicate
        insert: () => {
          referralsInsertCount++;
          return { data: null, error: null };
        },
      },
      survey_responses: { update: () => ({ data: null, error: null }) },
    };
    const handler = freshHandler('survey-referral-link');
    const res = await handler(postEvent({
      email: 'ref@me.co',
      customer_profile_id: 'cp-1',
      survey_response_id: 'sr-1',
    }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.ok(/^MCC[A-Z0-9]{6}$/.test(body.referral_code), 'referral_code shape: ' + body.referral_code);
    assert.ok(body.referral_url.includes('?ref=' + body.referral_code));
    assert.strictEqual(referralsInsertCount, 1);
  });

  await check('graceful-degrade: Supabase null returns 503 (frontend retry path)', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-referral-link');
    const res = await handler(postEvent({
      email: 'ref@me.co',
      survey_response_id: 'sr-1',
    }));
    assert.strictEqual(res.statusCode, 503);
  });

  await check('missing email returns 400', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-referral-link');
    const res = await handler(postEvent({ session_id: 'sess-1' }));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('missing all of (profile/response/session) ids returns 400', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-referral-link');
    const res = await handler(postEvent({ email: 'ref@me.co' }));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('per-IP rate limit returns 429 after exceeding the cap', async () => {
    supabaseImpl = null;
    const handler = freshHandler('survey-referral-link');
    // Vary the email so the per-email limiter doesn't fire first; we want
    // to assert specifically that the per-IP limiter trips at 30.
    let i = 0;
    const res = await exhaustRateLimit(handler, () => postEvent({
      email: 'rl-' + (i++) + '@me.co',
      session_id: 'sess-' + i,
    }));
    assert.strictEqual(res.statusCode, 429);
    assert.ok(res.headers['Retry-After']);
  });
}

// ===========================================================================
// www/_redirects parity — every survey-* handler must be reachable in prod.
// ===========================================================================

function testRedirectsParity() {
  console.log('www/_redirects parity');

  const redirectsPath = path.resolve(__dirname, '..', '..', 'www', '_redirects');
  const src = fs.readFileSync(redirectsPath, 'utf8');

  // The four handlers ported in Task #343 plus the older survey-profile
  // handler. Each MUST have a /api/survey/<slug> → /.netlify/functions/<file>
  // rule so the live survey page can reach them.
  const expected = [
    { route: '/api/survey/response',      target: 'survey-response' },
    { route: '/api/survey/abandoned',     target: 'survey-abandoned' },
    { route: '/api/survey/area-check',    target: 'survey-area-check' },
    { route: '/api/survey/referral-link', target: 'survey-referral-link' },
    { route: '/api/survey/profile',       target: 'survey-profile' },
  ];

  for (const { route, target } of expected) {
    check(`_redirects maps ${route} → ${target}`, () => {
      const re = new RegExp(
        '^\\s*' + route.replace(/[/.-]/g, '\\$&')
        + '\\s+/\\.netlify/functions/' + target + '\\s+200',
        'm',
      );
      assert.ok(re.test(src), `Missing redirect for ${route} → /.netlify/functions/${target}`);
      // Also confirm the handler file actually exists on disk so a typo'd
      // target slug can't silently 404 in prod.
      const handlerPath = path.resolve(__dirname, '..', 'functions', target + '.js');
      assert.ok(fs.existsSync(handlerPath), `Handler file missing: ${handlerPath}`);
    });
  }
}

// ---------------------------------------------------------------------------

(async () => {
  await testSurveyResponse();
  await testSurveyAbandoned();
  await testSurveyAreaCheck();
  await testSurveyReferralLink();
  testRedirectsParity();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
