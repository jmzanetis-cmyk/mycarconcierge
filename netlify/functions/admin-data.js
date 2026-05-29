// netlify/functions/admin-data.js
//
// Tab-loading read endpoints for the admin portal.
// Ported from server.js:
//   handleAdminGetProviders    (line 6994)
//   handleAdminGetMembers      (line 7087)
//   handleAdminGetPackages     (line 7177)
//   handleAdminGet2faGlobalStatus (line 7281)
//   handleAdminToggle2faGlobal    (line 7332)
//
// Routes (via _redirects):
//   GET /api/admin/providers         → admin-data/providers
//   GET /api/admin/members           → admin-data/members
//   GET /api/admin/packages          → admin-data/packages
//   GET /api/admin/2fa-global-status → admin-data/2fa-global-status
//   POST /api/admin/2fa-global-toggle → admin-data/2fa-global-toggle
//
// Auth: Authorization: Bearer <supabase_token> → verify with getUser → profiles.role === 'admin'
//
// Note: global 2FA state is read from the GLOBAL_2FA_ENABLED env var (default true).
// The toggle endpoint acknowledges the request but cannot persist state in serverless;
// set GLOBAL_2FA_ENABLED=false in Netlify env vars for a persistent override.

'use strict';

var utils = require('./utils');

async function authenticateBearerAdmin(event, supabase) {
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.slice(7).trim();
  if (!token) return null;
  var authResult = await supabase.auth.getUser(token);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return null;
  var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single();
  var profile = profileResult.data;
  if (!profile || profile.role !== 'admin') return null;
  return user;
}

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-data\/?/, '')
    .replace(/^\/api\/admin\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function handleProviders(supabase, qs) {
  var page   = Math.max(1, parseInt(qs.page)  || 1);
  var limit  = Math.min(parseInt(qs.limit) || 25, 100);
  var search = qs.search || '';
  var filter = qs.filter || 'all';
  var offset = (page - 1) * limit;

  var query = supabase
    .from('profiles')
    .select('*, provider_stats!provider_stats_provider_id_fkey!left(*)', { count: 'exact' })
    .eq('role', 'provider')
    .eq('application_status', 'approved');

  if (search) query = query.or(`full_name.ilike.%${search}%,business_name.ilike.%${search}%,email.ilike.%${search}%`);
  if (filter === 'active')         query = query.is('suspension_reason', null);
  else if (filter === 'suspended') query = query.not('suspension_reason', 'is', null);
  else if (filter === 'founding')  query = query.eq('is_founding_provider', true);

  var result = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (result.error) throw result.error;

  return {
    success: true,
    data: result.data || [],
    total: result.count || 0,
    page,
    totalPages: Math.ceil((result.count || 0) / limit)
  };
}

async function handleMembers(supabase, qs) {
  var page   = Math.max(1, parseInt(qs.page)  || 1);
  var limit  = Math.min(parseInt(qs.limit) || 25, 100);
  var search = qs.search || '';
  var filter = qs.filter || 'all';
  var offset = (page - 1) * limit;

  var query = supabase.from('profiles').select('*', { count: 'exact' }).eq('role', 'member');

  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  if (filter === 'individual')     query = query.or('account_type.eq.individual,account_type.is.null');
  else if (filter === 'family')    query = query.eq('account_type', 'family');
  else if (filter === 'fleet')     query = query.eq('account_type', 'fleet');

  var result = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (result.error) throw result.error;

  return {
    success: true,
    data: result.data || [],
    total: result.count || 0,
    page,
    totalPages: Math.ceil((result.count || 0) / limit)
  };
}

async function handlePackages(supabase, qs) {
  var page   = Math.max(1, parseInt(qs.page)  || 1);
  var limit  = Math.min(parseInt(qs.limit) || 25, 100);
  var search = qs.search || '';
  var filter = qs.filter || 'all';
  var offset = (page - 1) * limit;

  var query = supabase
    .from('maintenance_packages')
    .select('*, member:member_id(full_name, email), vehicles(year, make, model)', { count: 'exact' });

  if (search) query = query.or(`title.ilike.%${search}%`);
  if (filter && filter !== 'all') query = query.eq('status', filter);

  var result = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (result.error) throw result.error;

  var data = result.data || [];
  var bidCounts = {};
  if (data.length > 0) {
    var bidsResult = await supabase
      .from('bids')
      .select('package_id')
      .in('package_id', data.map(function(p) { return p.id; }));
    (bidsResult.data || []).forEach(function(b) {
      bidCounts[b.package_id] = (bidCounts[b.package_id] || 0) + 1;
    });
  }

  return {
    success: true,
    data: data.map(function(p) { return Object.assign({}, p, { bid_count: bidCounts[p.id] || 0 }); }),
    total: result.count || 0,
    page,
    totalPages: Math.ceil((result.count || 0) / limit)
  };
}

// ── Feature flags ─────────────────────────────────────────────────────────────
// Stored in platform_settings as { "enabled": bool, "test_users": ["uuid",...] }
// A flag is on for a user if global enabled=true OR their id is in test_users.

async function handleFeatureFlags(supabase) {
  var result = await supabase
    .from('platform_settings')
    .select('setting_key, setting_value, description, updated_at, updated_by')
    .in('setting_key', ['custody_chain_enabled', 'car_club_programs_enabled'])
    .order('setting_key');
  if (result.error) throw result.error;
  return { success: true, flags: result.data || [] };
}

async function handleFeatureFlagToggle(supabase, body, adminUserId) {
  var key     = (body.key     || '').trim();
  var enabled = body.enabled;
  var allowed = ['custody_chain_enabled', 'car_club_programs_enabled'];
  if (!allowed.includes(key)) {
    var e = new Error('Unknown flag key'); e.statusCode = 400; throw e;
  }
  if (typeof enabled !== 'boolean') {
    var e2 = new Error('enabled must be boolean'); e2.statusCode = 400; throw e2;
  }
  var existing = await supabase
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', key)
    .single();
  var currentVal = (existing.data && existing.data.setting_value) || { enabled: false, test_users: [] };
  var newVal = Object.assign({}, currentVal, { enabled });
  var upd = await supabase
    .from('platform_settings')
    .update({ setting_value: newVal, updated_at: new Date().toISOString(), updated_by: adminUserId })
    .eq('setting_key', key);
  if (upd.error) throw upd.error;
  return { success: true, key, enabled, message: key + ' ' + (enabled ? 'enabled' : 'disabled') + ' globally' };
}

async function handleFeatureFlagTestUsers(supabase, body, adminUserId) {
  var key    = (body.key     || '').trim();
  var userId = (body.user_id || '').trim();
  var action = (body.action  || '').trim(); // 'add' | 'remove'
  var allowed = ['custody_chain_enabled', 'car_club_programs_enabled'];
  if (!allowed.includes(key)) {
    var e = new Error('Unknown flag key'); e.statusCode = 400; throw e;
  }
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    var e2 = new Error('user_id must be a valid UUID'); e2.statusCode = 400; throw e2;
  }
  if (action !== 'add' && action !== 'remove') {
    var e3 = new Error('action must be add or remove'); e3.statusCode = 400; throw e3;
  }
  var existing = await supabase
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', key)
    .single();
  var currentVal = (existing.data && existing.data.setting_value) || { enabled: false, test_users: [] };
  var users = Array.isArray(currentVal.test_users) ? currentVal.test_users.slice() : [];
  if (action === 'add' && !users.includes(userId)) users.push(userId);
  if (action === 'remove') users = users.filter(function(u) { return u !== userId; });
  var newVal = Object.assign({}, currentVal, { test_users: users });
  var upd = await supabase
    .from('platform_settings')
    .update({ setting_value: newVal, updated_at: new Date().toISOString(), updated_by: adminUserId })
    .eq('setting_key', key);
  if (upd.error) throw upd.error;
  return { success: true, key, action, user_id: userId, test_users: users };
}

function handle2faStatus() {
  var raw = (process.env.GLOBAL_2FA_ENABLED || '').toLowerCase().trim();
  var enabled = raw !== 'false' && raw !== '0';
  return { success: true, enabled };
}

function handle2faToggle(body) {
  if (!body || typeof body.enabled !== 'boolean') {
    var err = new Error('enabled must be a boolean');
    err.statusCode = 400;
    throw err;
  }
  return {
    success: true,
    enabled: body.enabled,
    message: 'Two-factor authentication enforcement ' + (body.enabled ? 'enabled' : 'disabled') + ' globally',
    note: 'This setting is controlled by the GLOBAL_2FA_ENABLED environment variable. Set it to "false" in Netlify for a persistent override.'
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var user = await authenticateBearerAdmin(event, supabase);
  if (!user) return utils.errorResponse(401, 'Authentication required');

  var route  = parsePath(event);
  var qs     = event.queryStringParameters || {};
  var method = event.httpMethod;

  try {
    var result;

    if (route === 'providers' && method === 'GET') {
      result = await handleProviders(supabase, qs);

    } else if (route === 'members' && method === 'GET') {
      result = await handleMembers(supabase, qs);

    } else if (route === 'packages' && method === 'GET') {
      result = await handlePackages(supabase, qs);

    } else if (route === '2fa-global-status' && method === 'GET') {
      result = handle2faStatus();

    } else if (route === '2fa-global-toggle' && method === 'POST') {
      var body = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
      result = handle2faToggle(body);

    } else if (route === 'feature-flags' && method === 'GET') {
      result = await handleFeatureFlags(supabase);

    } else if (route === 'feature-flags/toggle' && method === 'POST') {
      var body = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
      result = await handleFeatureFlagToggle(supabase, body, user.id);

    } else if (route === 'feature-flags/test-users' && method === 'POST') {
      var body = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
      result = await handleFeatureFlagTestUsers(supabase, body, user.id);

    } else {
      return utils.errorResponse(404, 'Unknown route: ' + method + ' ' + route);
    }

    return utils.successResponse(result);
  } catch (err) {
    if (err.statusCode) return utils.errorResponse(err.statusCode, err.message);
    console.error('[admin-data] ' + route + ' error:', err.message);
    return utils.errorResponse(500, 'Something went wrong');
  }
};
