// netlify/functions/admin-hubspot.js
//
// HubSpot CRM tab for the admin portal.
// Ported from server.js lines 33996–34176 (using direct HTTP instead of @hubspot/api-client).
//
// Routes (via _redirects):
//   GET  /api/admin/hubspot/contacts       → list contacts
//   POST /api/admin/hubspot/contacts       → create contact
//   GET  /api/admin/hubspot/deals          → list deals
//   POST /api/admin/hubspot/deals          → create deal
//   GET  /api/admin/hubspot/companies      → list companies
//   POST /api/admin/hubspot/companies      → create company
//   POST /api/admin/hubspot/sync-members   → sync Supabase profiles → HubSpot
//
// Auth: Supabase Bearer JWT, role must be 'admin'
// HubSpot: HUBSPOT_PRIVATE_APP_TOKEN env var (private app bearer token)

'use strict';

var utils = require('./utils');

var HS_BASE = 'https://api.hubapi.com';


function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-hubspot\/?/, '')
    .replace(/^\/api\/admin\/hubspot\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

function getToken() {
  return process.env.HUBSPOT_PRIVATE_APP_TOKEN || '';
}

async function hsGet(path, qs) {
  var token = getToken();
  if (!token) throw Object.assign(new Error('HubSpot not configured'), { statusCode: 503 });

  var url = HS_BASE + path;
  if (qs) {
    var params = new URLSearchParams(qs);
    url += '?' + params.toString();
  }

  var res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  var json = await res.json();
  if (!res.ok) {
    var err = new Error((json && (json.message || json.error)) || 'HubSpot API error');
    err.statusCode = res.status >= 500 ? 502 : res.status;
    throw err;
  }
  return json;
}

async function hsPost(path, body) {
  var token = getToken();
  if (!token) throw Object.assign(new Error('HubSpot not configured'), { statusCode: 503 });

  var res = await fetch(HS_BASE + path, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var json = await res.json().catch(function() { return {}; });
  if (!res.ok && res.status !== 409) {
    var err = new Error((json && (json.message || json.error)) || 'HubSpot API error');
    err.statusCode = res.status >= 500 ? 502 : res.status;
    throw err;
  }
  return { status: res.status, data: json };
}

async function handleContacts(method, body) {
  if (method === 'GET') {
    var data = await hsGet('/crm/v3/objects/contacts', {
      limit: 100,
      properties: 'firstname,lastname,email,phone,company,lifecyclestage,createdate'
    });
    return { contacts: data.results || [] };
  }

  if (method === 'POST') {
    if (!body.email) throw Object.assign(new Error('Email is required'), { statusCode: 400 });
    var result = await hsPost('/crm/v3/objects/contacts', {
      properties: {
        firstname:      body.firstname || '',
        lastname:       body.lastname  || '',
        email:          body.email,
        phone:          body.phone     || '',
        company:        body.company   || '',
        lifecyclestage: body.lifecyclestage || 'lead'
      }
    });
    return { contact: result.data };
  }

  throw Object.assign(new Error('Method not allowed'), { statusCode: 405 });
}

async function handleDeals(method, body) {
  if (method === 'GET') {
    var data = await hsGet('/crm/v3/objects/deals', {
      limit: 100,
      properties: 'dealname,amount,dealstage,pipeline,closedate,createdate'
    });
    return { deals: data.results || [] };
  }

  if (method === 'POST') {
    if (!body.dealname) throw Object.assign(new Error('Deal name is required'), { statusCode: 400 });
    var result = await hsPost('/crm/v3/objects/deals', {
      properties: {
        dealname:  body.dealname,
        amount:    body.amount    || '',
        dealstage: body.dealstage || 'appointmentscheduled',
        pipeline:  body.pipeline  || 'default',
        closedate: body.closedate || ''
      }
    });
    return { deal: result.data };
  }

  throw Object.assign(new Error('Method not allowed'), { statusCode: 405 });
}

async function handleCompanies(method, body) {
  if (method === 'GET') {
    var data = await hsGet('/crm/v3/objects/companies', {
      limit: 100,
      properties: 'name,domain,industry,phone,city,state,createdate'
    });
    return { companies: data.results || [] };
  }

  if (method === 'POST') {
    if (!body.name) throw Object.assign(new Error('Company name is required'), { statusCode: 400 });
    var result = await hsPost('/crm/v3/objects/companies', {
      properties: {
        name:     body.name,
        domain:   body.domain   || '',
        industry: body.industry || '',
        phone:    body.phone    || '',
        city:     body.city     || '',
        state:    body.state    || ''
      }
    });
    return { company: result.data };
  }

  throw Object.assign(new Error('Method not allowed'), { statusCode: 405 });
}

async function handleSyncMembers(supabase) {
  var profilesResult = await supabase
    .from('profiles')
    .select('id, email, full_name, role, phone')
    .order('created_at', { ascending: false })
    .limit(500);

  if (profilesResult.error) throw profilesResult.error;

  var profiles = profilesResult.data || [];
  var synced  = 0;
  var skipped = 0;

  for (var i = 0; i < profiles.length; i++) {
    var p = profiles[i];
    if (!p.email) { skipped++; continue; }

    var nameParts = (p.full_name || '').split(' ');
    var firstname = nameParts[0] || '';
    var lastname  = nameParts.slice(1).join(' ') || '';
    var lifecycle = (p.role === 'provider' || p.role === 'pending_provider') ? 'customer' : 'lead';

    try {
      var result = await hsPost('/crm/v3/objects/contacts', {
        properties: { email: p.email, firstname, lastname, phone: p.phone || '', lifecyclestage: lifecycle, mcc_role: p.role || 'member' }
      });
      if (result.status === 409) { skipped++; }
      else { synced++; }
    } catch (err) {
      console.error('[admin-hubspot] sync error for', p.email, ':', err.message);
      skipped++;
    }
  }

  console.log('[admin-hubspot] sync-members complete:', synced, 'synced,', skipped, 'skipped');
  return { synced, skipped, total: profiles.length };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');
  var admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return utils.errorResponse(401, 'Authentication required');

  var path   = parsePath(event);
  var method = event.httpMethod;

  var body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
  }

  try {
    if (path === 'contacts') {
      return utils.successResponse(await handleContacts(method, body));
    }

    if (path === 'deals') {
      return utils.successResponse(await handleDeals(method, body));
    }

    if (path === 'companies') {
      return utils.successResponse(await handleCompanies(method, body));
    }

    if (path === 'sync-members' && method === 'POST') {
      return utils.successResponse(await handleSyncMembers(supabase));
    }

    return utils.errorResponse(404, 'Unknown route: ' + method + ' ' + path);

  } catch (err) {
    if (err.statusCode) return utils.errorResponse(err.statusCode, err.message);
    console.error('[admin-hubspot] error on', path, ':', err.message);
    return utils.errorResponse(500, 'Something went wrong');
  }
};
