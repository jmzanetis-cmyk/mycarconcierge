// ============================================================================
// Smoke tests for the GET /api/admin/outreach/leads/export endpoint added by
// Task #402 in netlify/functions/outreach-admin.js.
//
// Coverage:
//   1) Unauthorized (no x-admin-token) -> 401.
//   2) Invalid date_from -> 400.
//   3) Happy path: returns text/csv with attachment filename, correct header
//      row, one data row per lead, joined contacted_at /
//      profile_created_at / application_submitted_at populated, and lead
//      filters (type / status) flow into the filename.
//   4) Empty result set still returns 200 + header-only CSV.
//   5) source filter scopes the export to one lead source.
//   6) date_from / date_to scope the export to a single day and that range
//      is reflected in the downloaded filename.
//
// Run with:  node netlify/functions-tests/outreach-admin-leads-export.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const path = require('node:path');

const ADMIN_PASSWORD = 'test-admin-task-402';
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

let dbState;
function resetDbState() {
  dbState = {
    outreach_leads: [],
    outreach_messages: [],
    provider_applications: [],
    profiles: []
  };
}

function makeChain(table) {
  // Multiple filters per field (e.g. gte + lt on created_at for a date window)
  // are common, so store filters as an array of {field, op, ...} specs.
  const filters = [];
  const notFields = new Set();
  let rangeBounds = null;
  let orderField = null;
  const chain = {
    _table: table,
    select() { return chain; },
    eq(field, value) { filters.push({ field, op: 'eq', value }); return chain; },
    gte(field, value) { filters.push({ field, op: 'gte', value }); return chain; },
    lt(field, value) { filters.push({ field, op: 'lt', value }); return chain; },
    in(field, values) { filters.push({ field, op: 'in', values: new Set(values) }); return chain; },
    is() { return chain; },
    not(field, _op, _value) { notFields.add(field); return chain; },
    or() { return chain; },
    order(field) { orderField = field; return chain; },
    range(from, to) { rangeBounds = [from, to]; return chain; },
    limit() { return chain; },
    single() {
      if (table === 'profiles') return Promise.resolve({ data: { role: 'admin' }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    insert() { return Promise.resolve({ data: null, error: null }); },
    update() { return { eq: () => Promise.resolve({ data: null, error: null }) }; },
    delete() { return chain; },
    then(resolve) {
      const rows = dbState[table] || [];
      let filtered = rows.filter(row => {
        for (const nf of notFields) {
          if (row[nf] === null || row[nf] === undefined) return false;
        }
        for (const spec of filters) {
          const { field, op } = spec;
          if (op === 'eq' && row[field] !== spec.value) return false;
          if (op === 'gte' && !(row[field] >= spec.value)) return false;
          if (op === 'lt' && !(row[field] < spec.value)) return false;
          if (op === 'in' && !spec.values.has(row[field])) return false;
        }
        return true;
      });
      if (orderField) {
        filtered = filtered.slice().sort((a, b) => (a[orderField] < b[orderField] ? 1 : -1));
      }
      if (rangeBounds) {
        filtered = filtered.slice(rangeBounds[0], rangeBounds[1] + 1);
      }
      return Promise.resolve({ data: filtered, error: null, count: filtered.length }).then(resolve);
    }
  };
  return chain;
}

const supabaseStub = {
  from: (t) => makeChain(t),
  auth: {
    getUser: async (token) => {
      if (!token) return { data: { user: null }, error: { message: 'no token' } };
      return { data: { user: { id: 'stub-admin-uid' } }, error: null };
    }
  }
};

const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
const stubExports = { createClient: () => supabaseStub };
for (const sp of supabasePaths) {
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: stubExports };
}

const outreachAdmin = require('../functions/outreach-admin');

function makeEvent({ path: p, method = 'GET', headers = {}, query = {} }) {
  return {
    path: p,
    httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: query,
    body: null
  };
}
function adminHeaders() { return { authorization: 'Bearer stub-admin-bearer' }; }

(async () => {
  // ---- 1) Unauthorized ----
  resetDbState();
  let res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/leads/export', method: 'GET'
  }));
  assert.strictEqual(res.statusCode, 401, '1: missing admin token must be 401');
  console.log('  ✓ 1) /leads/export rejects without x-admin-token (401)');

  // ---- 2) Invalid date_from ----
  resetDbState();
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/leads/export', method: 'GET',
    headers: adminHeaders(), query: { date_from: 'last week' }
  }));
  assert.strictEqual(res.statusCode, 400, '2: bad date_from must be 400');
  const errBody = JSON.parse(res.body);
  assert.ok(/YYYY-MM-DD/.test(errBody.error), '2: error must explain YYYY-MM-DD');
  console.log('  ✓ 2) /leads/export rejects invalid date_from (400)');

  // ---- 3) Happy path with joins + filter-driven filename ----
  resetDbState();
  dbState.outreach_leads = [
    {
      id: 'lead-a', type: 'provider', name: 'Acme Auto', email: 'a@example.com',
      phone: '555-0001', company: 'Acme', location: 'Newark NJ', source: 'apollo',
      status: 'contacted', crm_sync_status: 'linked',
      crm_profile_id: 'profile-1', created_at: '2026-05-01T10:00:00Z'
      // Location intentionally has no comma so the naive cols.split(',')
      // below stays aligned (csvEscape would otherwise quote it).
    },
    {
      id: 'lead-b', type: 'provider', name: 'Beta Shop', email: 'b@example.com',
      phone: null, company: null, location: null, source: 'google_places',
      status: 'new', crm_sync_status: 'unlinked',
      crm_profile_id: null, created_at: '2026-05-02T10:00:00Z'
    },
    // Different type — should be filtered out
    {
      id: 'lead-c', type: 'member', name: 'Gamma', email: 'c@example.com',
      phone: null, company: null, location: null, source: 'manual',
      status: 'new', crm_sync_status: 'unlinked',
      crm_profile_id: null, created_at: '2026-05-03T10:00:00Z'
    }
  ];
  dbState.outreach_messages = [
    { lead_id: 'lead-a', sent_at: '2026-05-05T12:00:00Z' },
    // Earlier message wins (min)
    { lead_id: 'lead-a', sent_at: '2026-05-04T12:00:00Z' }
  ];
  dbState.provider_applications = [
    { outreach_lead_id: 'lead-a', created_at: '2026-05-10T00:00:00Z' }
  ];
  dbState.profiles = [
    { id: 'profile-1', created_at: '2026-05-06T00:00:00Z' }
  ];

  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/leads/export', method: 'GET',
    headers: adminHeaders(), query: { type: 'provider', status: 'contacted' }
  }));
  assert.strictEqual(res.statusCode, 200, '3: happy path must be 200');
  assert.strictEqual(res.headers['Content-Type'], 'text/csv; charset=utf-8',
    '3: must return text/csv');
  const disp = res.headers['Content-Disposition'] || '';
  assert.ok(/attachment; filename="/.test(disp), '3: must set attachment Content-Disposition');
  assert.ok(/type-provider/.test(disp), '3: filename must include the type filter');
  assert.ok(/status-contacted/.test(disp), '3: filename must include the status filter');
  assert.ok(/\.csv"/.test(disp), '3: filename must end in .csv');

  const lines = res.body.trim().split('\n');
  assert.strictEqual(lines[0],
    'id,type,name,email,phone,company,location,source,status,crm_sync_status,created_at,contacted_at,profile_created_at,application_submitted_at',
    '3: header row must match the documented columns');
  // type=provider + status=contacted filters → only lead-a matches.
  assert.strictEqual(lines.length, 2, '3: exactly one data row (lead-a) after filtering');
  const cols = lines[1].split(',');
  assert.strictEqual(cols[0], 'lead-a', '3: row id');
  assert.strictEqual(cols[1], 'provider', '3: row type');
  assert.strictEqual(cols[8], 'contacted', '3: row status');
  assert.strictEqual(cols[11], '2026-05-04T12:00:00Z', '3: contacted_at = earliest sent_at');
  assert.strictEqual(cols[12], '2026-05-06T00:00:00Z', '3: profile_created_at from joined profile');
  assert.strictEqual(cols[13], '2026-05-10T00:00:00Z', '3: application_submitted_at from joined provider_applications');
  console.log('  ✓ 3) /leads/export returns CSV with joined timestamps + filter-aware filename');

  // ---- 4) Empty result set ----
  resetDbState();
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/leads/export', method: 'GET',
    headers: adminHeaders()
  }));
  assert.strictEqual(res.statusCode, 200, '4: empty must still be 200');
  const emptyLines = res.body.trim().split('\n');
  assert.strictEqual(emptyLines.length, 1, '4: only header row when no leads');
  assert.ok(emptyLines[0].startsWith('id,type,name,'), '4: header still emitted');
  console.log('  ✓ 4) /leads/export returns header-only CSV when no leads match');

  // ---- 5) source filter scopes the export ----
  resetDbState();
  dbState.outreach_leads = [
    {
      id: 'lead-x', type: 'provider', name: 'X Shop', email: 'x@example.com',
      phone: null, company: null, location: null, source: 'apollo',
      status: 'new', crm_sync_status: 'unlinked',
      crm_profile_id: null, created_at: '2026-05-01T10:00:00Z'
    },
    {
      id: 'lead-y', type: 'provider', name: 'Y Shop', email: 'y@example.com',
      phone: null, company: null, location: null, source: 'google_places',
      status: 'new', crm_sync_status: 'unlinked',
      crm_profile_id: null, created_at: '2026-05-02T10:00:00Z'
    }
  ];
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/leads/export', method: 'GET',
    headers: adminHeaders(), query: { source: 'apollo' }
  }));
  assert.strictEqual(res.statusCode, 200, '5: source-filtered export must be 200');
  const sLines = res.body.trim().split('\n');
  assert.strictEqual(sLines.length, 2, '5: only one data row (lead-x) when source=apollo');
  assert.strictEqual(sLines[1].split(',')[0], 'lead-x', '5: row id must be the apollo lead');
  assert.ok(/source-apollo/.test(res.headers['Content-Disposition'] || ''),
    '5: filename must include the source filter token');
  console.log('  ✓ 5) /leads/export honours source filter (and source token in filename)');

  // ---- 6) date_from / date_to scope the export + appear in filename ----
  resetDbState();
  dbState.outreach_leads = [
    {
      id: 'lead-jan', type: 'provider', name: 'Jan Shop', email: 'jan@example.com',
      phone: null, company: null, location: null, source: 'manual',
      status: 'new', crm_sync_status: 'unlinked',
      crm_profile_id: null, created_at: '2026-01-15T10:00:00Z'
    },
    {
      id: 'lead-feb', type: 'provider', name: 'Feb Shop', email: 'feb@example.com',
      phone: null, company: null, location: null, source: 'manual',
      status: 'new', crm_sync_status: 'unlinked',
      crm_profile_id: null, created_at: '2026-02-15T10:00:00Z'
    }
  ];
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/leads/export', method: 'GET',
    headers: adminHeaders(), query: { date_from: '2026-02-01', date_to: '2026-02-28' }
  }));
  assert.strictEqual(res.statusCode, 200, '6: date-filtered export must be 200');
  const dLines = res.body.trim().split('\n');
  assert.strictEqual(dLines.length, 2, '6: only Feb lead in the Feb date window');
  assert.strictEqual(dLines[1].split(',')[0], 'lead-feb', '6: row id must be the Feb lead');
  const dDisp = res.headers['Content-Disposition'] || '';
  assert.ok(/2026-02-01_2026-02-28/.test(dDisp),
    '6: filename must reflect the requested date window: ' + dDisp);
  console.log('  ✓ 6) /leads/export honours date_from/date_to + window appears in filename');

  console.log('\nAll outreach-admin leads-export smoke tests passed.');
})().catch(e => { console.error('TEST FAILURE:', e); process.exit(1); });
