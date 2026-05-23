// ============================================================================
// Task #361 — Tighten document upload URL check to the provider-documents
// bucket / requesting user's own prefix.
//
// /api/provider/document used to only verify that file_url was on the
// configured Supabase host. A malicious client could still POST a URL that
// pointed at another bucket on the same host, or at another tenant's prefix
// inside provider-documents. The handler now requires the path to start with
//   /storage/v1/object/public/provider-documents/<jwt-user-id>/<filename>
//
// This smoke test stubs Supabase auth (so we reach the validation branch)
// and asserts:
//   1. Wrong host                              -> 400
//   2. Wrong bucket on the right host          -> 400
//   3. Right bucket but another user's prefix  -> 400
//   4. Right bucket / user prefix with no file -> 400
//   5. Valid URL                               -> reaches insert (we stub it
//      to fail with a sentinel so we don't need a real DB; a 500 with the
//      sentinel proves validation passed)
//
// Run with:  node netlify/functions-tests/provider-document-url.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const Module = require('module');

process.env.SUPABASE_URL = 'https://stub-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER_USER_ID = '11111111-2222-3333-4444-555555555555';
const APPLICATION_ID = '99999999-8888-7777-6666-555555555555';
const TOKEN = 'stub-bearer-token';
const INSERT_SENTINEL = 'STUB_INSERT_NEVER_REACHED';

// Tiny query-builder stub for the application-ownership lookup + document
// insert paths.
function makeSupabaseStub() {
  return {
    auth: {
      getUser: async (tok) => {
        if (tok !== TOKEN) return { data: null, error: { message: 'bad token' } };
        return { data: { user: { id: USER_ID, email: 'p@example.com' } }, error: null };
      }
    },
    from(table) {
      if (table === 'provider_applications') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { user_id: USER_ID }, error: null })
            })
          })
        };
      }
      if (table === 'provider_documents') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { message: INSERT_SENTINEL } })
            })
          })
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }
  };
}

const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === '@supabase/supabase-js') {
    return { createClient: () => makeSupabaseStub() };
  }
  return origLoad.call(this, request, parent, ...rest);
};

const { handler } = require('../functions/provider-onboarding.js');

function invoke(file_url) {
  return handler({
    httpMethod: 'POST',
    path: '/api/provider/document',
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      application_id: APPLICATION_ID,
      document_type: 'business_license',
      document_name: 'license.pdf',
      file_url
    })
  });
}

(async () => {
  const cases = [
    {
      name: 'rejects wrong host',
      url: 'https://evil.example.com/storage/v1/object/public/provider-documents/' + USER_ID + '/license.pdf',
      expectStatus: 400,
      expectDetail: /Supabase storage host/
    },
    {
      name: 'rejects wrong bucket on right host',
      url: 'https://stub-project.supabase.co/storage/v1/object/public/some-other-bucket/' + USER_ID + '/license.pdf',
      expectStatus: 400,
      expectDetail: /provider-documents bucket/
    },
    {
      name: 'rejects another user\'s prefix in same bucket',
      url: 'https://stub-project.supabase.co/storage/v1/object/public/provider-documents/' + OTHER_USER_ID + '/license.pdf',
      expectStatus: 400,
      expectDetail: /provider-documents bucket/
    },
    {
      name: 'rejects right prefix but no filename',
      url: 'https://stub-project.supabase.co/storage/v1/object/public/provider-documents/' + USER_ID + '/',
      expectStatus: 400,
      expectDetail: /provider-documents bucket/
    },
    {
      name: 'rejects bucket-name prefix collision (provider-documents-evil)',
      url: 'https://stub-project.supabase.co/storage/v1/object/public/provider-documents-evil/' + USER_ID + '/license.pdf',
      expectStatus: 400,
      expectDetail: /provider-documents bucket/
    }
  ];

  for (const c of cases) {
    const res = await invoke(c.url);
    assert.strictEqual(res.statusCode, c.expectStatus, `${c.name}: expected ${c.expectStatus}, got ${res.statusCode} body=${res.body}`);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'validation failed', `${c.name}: wrong error label: ${res.body}`);
    assert.ok(Array.isArray(body.details) && body.details.some(d => c.expectDetail.test(d)),
      `${c.name}: expected detail matching ${c.expectDetail}, got ${JSON.stringify(body.details)}`);
    console.log('  ok -', c.name);
  }

  // Positive case: a valid URL should pass validation and reach the insert
  // (which our stub rejects with INSERT_SENTINEL → 500).
  const okUrl = 'https://stub-project.supabase.co/storage/v1/object/public/provider-documents/' + USER_ID + '/license.pdf';
  const okRes = await invoke(okUrl);
  assert.strictEqual(okRes.statusCode, 500, `valid URL should pass validation, got ${okRes.statusCode} body=${okRes.body}`);
  const okBody = JSON.parse(okRes.body);
  assert.ok(String(okBody.details || '').includes(INSERT_SENTINEL),
    `valid URL should have reached insert; body=${okRes.body}`);
  console.log('  ok - valid URL passes validation and reaches insert');

  console.log('\nAll provider-document-url validation tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
