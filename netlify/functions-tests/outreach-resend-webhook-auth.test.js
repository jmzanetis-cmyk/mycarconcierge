'use strict';

// Task #363 — Resend webhook fail-closed when secret missing in prod.
//
// Tests (all in-process against the Netlify function handler):
//   1. NODE_ENV=production + no secret → 401
//   2. Any env + set secret + missing sig headers → 401
//   3. Set secret + valid HMAC → 200
//
// Run:  node netlify/functions-tests/outreach-resend-webhook-auth.test.js

const assert  = require('assert');
const crypto  = require('node:crypto');
const path    = require('node:path');

// Stub outreach-engine-core before requiring the handler so no real DB calls
// happen.
const Module = require('module');
const origLoad = Module._load.bind(Module);
Module._load = function(req, parent, isMain) {
  if (req === './outreach-engine-core' || req.endsWith('outreach-engine-core')) {
    return {
      createSupabaseClient: () => null,
      runEngineCycle: async () => ({})
    };
  }
  return origLoad(req, parent, isMain);
};

const handlerPath = path.join(__dirname, '..', 'functions', 'outreach-resend-webhook.js');
// Clear any cached version so our env changes take effect per-test.
function loadFresh() {
  delete require.cache[handlerPath];
  return require(handlerPath).handler;
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else       { console.error('  FAIL', name, detail || ''); fail++; }
}

function makeSvixHeaders(secret, body) {
  const svixId        = 'msg_test_' + Date.now();
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const secretBytes   = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const hmac          = crypto.createHmac('sha256', secretBytes);
  hmac.update(signedContent);
  const sig = `v1,${hmac.digest('base64')}`;
  return { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': sig };
}

function makeEvent(headers, body) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    queryStringParameters: {},
    body: body || '{}'
  };
}

(async () => {
  // Test 1: prod + no secret → 401
  {
    const saved = process.env.RESEND_WEBHOOK_SECRET;
    const savedEnv = process.env.NODE_ENV;
    delete process.env.RESEND_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';
    const handler = loadFresh();
    const r = await handler(makeEvent({}, '{}'));
    if (saved !== undefined) process.env.RESEND_WEBHOOK_SECRET = saved;
    else delete process.env.RESEND_WEBHOOK_SECRET;
    process.env.NODE_ENV = savedEnv;
    ok('prod + no secret → 401', r.statusCode === 401, `got ${r.statusCode}`);
  }

  // Test 2: secret set + missing sig headers → 401
  {
    const secret = 'whsec_dGVzdHNlY3JldGtleWZvcnRlc3Rpbmc=';
    process.env.RESEND_WEBHOOK_SECRET = secret;
    process.env.NODE_ENV = 'test';
    const handler = loadFresh();
    const r = await handler(makeEvent({}, '{}'));
    delete process.env.RESEND_WEBHOOK_SECRET;
    ok('secret set + missing sig headers → 401', r.statusCode === 401, `got ${r.statusCode}`);
  }

  // Test 3: secret set + valid HMAC → 200 (supabase is null so handler returns early 200)
  {
    const secret = 'whsec_dGVzdHNlY3JldGtleWZvcnRlc3Rpbmc=';
    const body = JSON.stringify({ type: 'email.sent', data: {} });
    const svixHdrs = makeSvixHeaders(secret, body);
    process.env.RESEND_WEBHOOK_SECRET = secret;
    process.env.NODE_ENV = 'test';
    const handler = loadFresh();
    const r = await handler(makeEvent(svixHdrs, body));
    delete process.env.RESEND_WEBHOOK_SECRET;
    ok('valid HMAC → 200', r.statusCode === 200, `got ${r.statusCode}`);
  }

  // Test 4: dev (no NODE_ENV=production) + no secret → still passes through (200)
  {
    const saved = process.env.RESEND_WEBHOOK_SECRET;
    const savedEnv = process.env.NODE_ENV;
    delete process.env.RESEND_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'development';
    const handler = loadFresh();
    const r = await handler(makeEvent({}, '{}'));
    if (saved !== undefined) process.env.RESEND_WEBHOOK_SECRET = saved;
    process.env.NODE_ENV = savedEnv;
    ok('dev + no secret → passes through (200)', r.statusCode === 200, `got ${r.statusCode}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
