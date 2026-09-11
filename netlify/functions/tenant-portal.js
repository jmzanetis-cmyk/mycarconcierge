// netlify/functions/tenant-portal.js
//
// Consolidated tenant admin portal backend -- serves the 5 owner/admin-only
// white-label tenant management routes called from www/members.html's
// "White-label Tenant Portal" card (Task #87). Previously dead-called:
// server.js's dev routes were removed and never ported to a Netlify
// function, so every one of these was a genuine 404 for any real tenant
// admin. Ported near-verbatim from the pre-deletion www/server.js history
// (git show 5587e05:www/server.js), with one deliberate consistency fix
// noted below.
//
// Routes (all owner/admin-of-tenant only, Bearer auth required):
//   GET    /api/tenant/me
//   GET    /api/tenant/roster
//   DELETE /api/tenant/roster/:userId
//   GET    /api/tenant/analytics
//   GET    /api/tenant/loyalty-config
//   POST   /api/tenant/loyalty-config
//   GET    /api/tenant/approval-workflow
//   POST   /api/tenant/approval-workflow
//
// CONSISTENCY FIX vs. the original server.js handlers: the original
// loyalty-config and approval-workflow handlers resolved the caller's
// tenant ONLY via an existing white_label_tenant_users row, while me/
// roster/analytics also fell back to white_label_tenants.owner_user_id
// (for tenants created before membership rows existed). That was an
// inconsistency, not an intentional restriction -- all 5 routes here
// share one resolver that includes the owner_user_id fallback, so a
// tenant owner without a membership row can manage every section, not
// just some of them.
//
// NOTE: profiles.tenant_id (nulled here when a user leaves their last
// tenant) has no CREATE TABLE/ALTER in supabase/migrations/ -- schema
// drift, added directly in Supabase, same situation as profiles.
// directory_slug/directory_opt_in in provider-profile-publish.js.
// Trusting it exists, matching the original handler.
'use strict';

var utils = require('./utils');

var PLAN_FEATURES = {
  starter:  { custom_domain: false, custom_css: false, analytics: false, sms_reminders: false, api_access: false, white_label_branding: true },
  pro:      { custom_domain: true,  custom_css: true,  analytics: true,  sms_reminders: true,  api_access: false, white_label_branding: true },
  business: { custom_domain: true,  custom_css: true,  analytics: true,  sms_reminders: true,  api_access: true,  white_label_branding: true }
};

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/tenant-portal\/?/, '')
    .replace(/^\/api\/tenant\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function getBearerUser(event, supabase) {
  var authHeader = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'];
  var token = authHeader ? String(authHeader).replace(/^Bearer\s+/i, '').trim() : null;
  if (!token) return null;
  var res = await supabase.auth.getUser(token);
  if (res.error || !res.data || !res.data.user) return null;
  return res.data.user;
}

// Resolves the tenant this user administers (owner/admin), owner-first then
// most-recent membership, falling back to direct white_label_tenants.
// owner_user_id ownership for tenants created before membership tracking.
async function resolveTenantAdmin(supabase, userId) {
  var membsRes = await supabase
    .from('white_label_tenant_users')
    .select('tenant_id, role')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .order('joined_at', { ascending: false });
  var membs = membsRes.data || [];
  var sorted = membs.slice().sort(function (a, b) {
    if (a.role === 'owner' && b.role !== 'owner') return -1;
    if (b.role === 'owner' && a.role !== 'owner') return 1;
    return 0;
  });
  var membership = sorted[0] || null;
  var tenantId = membership ? membership.tenant_id : null;
  if (!tenantId) {
    var ownedRes = await supabase
      .from('white_label_tenants')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    tenantId = ownedRes.data ? ownedRes.data.id : null;
  }
  return { tenantId: tenantId, role: membership ? membership.role : (tenantId ? 'owner' : null) };
}

async function handleMe(event, supabase, user) {
  var admin = await resolveTenantAdmin(supabase, user.id);
  if (!admin.tenantId) return utils.errorResponse(404, 'No active tenant found for this user');

  var tenantRes = await supabase
    .from('white_label_tenants')
    .select('id, name, brand_name, domain, subdomain, logo_url, favicon_url, primary_color, accent_color, bg_color, support_email, plan, status, max_members, max_providers, stripe_subscription_id, created_at, updated_at')
    .eq('id', admin.tenantId)
    .eq('status', 'active')
    .single();
  if (tenantRes.error || !tenantRes.data) return utils.errorResponse(404, 'Tenant not found or inactive');
  var tenant = tenantRes.data;

  var memberCountRes = await supabase.from('white_label_tenant_users').select('id', { count: 'exact', head: true }).eq('tenant_id', admin.tenantId).eq('role', 'member');
  var providerCountRes = await supabase.from('white_label_tenant_users').select('id', { count: 'exact', head: true }).eq('tenant_id', admin.tenantId).eq('role', 'provider');
  var adminCountRes = await supabase.from('white_label_tenant_users').select('id', { count: 'exact', head: true }).eq('tenant_id', admin.tenantId).in('role', ['owner', 'admin']);

  var planFeatures = PLAN_FEATURES[tenant.plan || 'starter'] || PLAN_FEATURES.starter;

  return utils.successResponse({
    tenant: tenant,
    usage: {
      members: { current: memberCountRes.count || 0, limit: tenant.max_members, unlimited: tenant.max_members === -1 },
      providers: { current: providerCountRes.count || 0, limit: tenant.max_providers, unlimited: tenant.max_providers === -1 },
      admins: { current: adminCountRes.count || 0 }
    },
    plan_features: planFeatures,
    user_role: admin.role || 'owner'
  });
}

async function handleRosterList(event, supabase, user) {
  var admin = await resolveTenantAdmin(supabase, user.id);
  if (!admin.tenantId) return utils.errorResponse(403, 'Not a tenant admin');

  var rosterRes = await supabase
    .from('white_label_tenant_users')
    .select('id, user_id, role, joined_at')
    .eq('tenant_id', admin.tenantId)
    .order('joined_at', { ascending: false });
  var roster = rosterRes.data || [];

  var userIds = roster.map(function (r) { return r.user_id; });
  var profilesById = {};
  if (userIds.length > 0) {
    var profRes = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
    (profRes.data || []).forEach(function (p) { profilesById[p.id] = p; });
  }
  var enriched = roster.map(function (r) {
    var p = profilesById[r.user_id];
    return {
      id: r.id,
      user_id: r.user_id,
      role: r.role,
      joined_at: r.joined_at,
      display_name: (p && (p.full_name || p.email)) || (r.user_id.slice(0, 8) + '…'),
      email: (p && p.email) || null
    };
  });

  return utils.successResponse({ roster: enriched, tenant_id: admin.tenantId });
}

async function handleRosterDelete(event, supabase, user, targetId) {
  var admin = await resolveTenantAdmin(supabase, user.id);
  if (!admin.tenantId) return utils.errorResponse(403, 'Not a tenant admin');

  var callerRole = admin.role || 'owner';
  if (targetId === user.id && callerRole === 'owner') {
    return utils.errorResponse(400, 'Cannot remove yourself as owner. Transfer ownership first.');
  }

  var targetRes = await supabase.from('white_label_tenant_users').select('role').eq('tenant_id', admin.tenantId).eq('user_id', targetId).maybeSingle();
  if (!targetRes.data) return utils.errorResponse(404, 'User is not a member of this tenant');
  var targetRole = targetRes.data.role;
  if (callerRole === 'admin' && ['owner', 'admin'].indexOf(targetRole) !== -1) {
    return utils.errorResponse(403, 'Admins can only remove members and providers.');
  }

  var delRes = await supabase.from('white_label_tenant_users').delete().eq('tenant_id', admin.tenantId).eq('user_id', targetId);
  if (delRes.error) throw new Error(delRes.error.message);

  var remainingRes = await supabase.from('white_label_tenant_users').select('tenant_id').eq('user_id', targetId).limit(1).maybeSingle();
  if (!remainingRes.data) {
    await supabase.from('profiles').update({ tenant_id: null }).eq('id', targetId);
  }

  return utils.successResponse({ success: true });
}

async function handleAnalytics(event, supabase, user) {
  var admin = await resolveTenantAdmin(supabase, user.id);
  if (!admin.tenantId) return utils.errorResponse(403, 'Not a tenant admin');

  // SCHEMA GAP (flagged 2026-09-11): the original handler counted
  // maintenance_packages.tenant_id / bids.tenant_id / page_views.tenant_id.
  // None of those columns exist in the current schema (maintenance_packages
  // has no tenant_id; there is no bare "bids" table, only plan_bids /
  // bulk_service_bids; page_views has no tenant_id either). Rather than
  // querying columns that don't exist (which would 500) or guessing at a
  // schema redesign, we ship the one metric we CAN compute correctly today
  // (active_providers, from white_label_tenant_users) and zero the rest.
  // Follow-up: add tenant_id to whichever of these tables should actually
  // be tenant-scoped, then wire real counts through here.
  var providerCountRes = await supabase
    .from('white_label_tenant_users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', admin.tenantId)
    .eq('role', 'provider');

  return utils.successResponse({
    tenant_id: admin.tenantId,
    metrics: {
      total_service_requests: 0,
      total_bids: 0,
      total_page_views: 0,
      active_providers: providerCountRes.count || 0
    }
  });
}

async function handleLoyaltyGet(event, supabase, user) {
  var admin = await resolveTenantAdmin(supabase, user.id);
  if (!admin.tenantId) return utils.errorResponse(403, 'Not a tenant admin');
  var tenantRes = await supabase.from('white_label_tenants').select('features').eq('id', admin.tenantId).maybeSingle();
  var features = (tenantRes.data && tenantRes.data.features) || {};
  var loyaltyConfig = features.loyalty_program || { enabled: false, punch_card_goal: 10, reward_description: '' };
  return utils.successResponse({ loyalty_program: loyaltyConfig });
}

async function handleLoyaltyPost(event, supabase, user) {
  var admin = await resolveTenantAdmin(supabase, user.id);
  if (!admin.tenantId) return utils.errorResponse(403, 'Not a tenant admin');
  var body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON body'); }

  var tenantRes = await supabase.from('white_label_tenants').select('features').eq('id', admin.tenantId).maybeSingle();
  var features = (tenantRes.data && tenantRes.data.features) || {};
  features.loyalty_program = {
    enabled: !!body.enabled,
    punch_card_goal: Math.max(1, parseInt(body.punch_card_goal, 10) || 10),
    reward_description: String(body.reward_description || '').slice(0, 255)
  };
  var updRes = await supabase.from('white_label_tenants').update({ features: features }).eq('id', admin.tenantId);
  if (updRes.error) throw new Error(updRes.error.message);
  return utils.successResponse({ success: true, loyalty_program: features.loyalty_program });
}

async function handleApprovalGet(event, supabase, user) {
  var admin = await resolveTenantAdmin(supabase, user.id);
  if (!admin.tenantId) return utils.errorResponse(403, 'Not a tenant admin');
  var tenantRes = await supabase.from('white_label_tenants').select('features').eq('id', admin.tenantId).maybeSingle();
  var features = (tenantRes.data && tenantRes.data.features) || {};
  var approvalWorkflow = features.approval_workflow || { require_provider_approval: false, require_member_approval: false, auto_approve_verified: true };
  return utils.successResponse({ approval_workflow: approvalWorkflow });
}

async function handleApprovalPost(event, supabase, user) {
  var admin = await resolveTenantAdmin(supabase, user.id);
  if (!admin.tenantId) return utils.errorResponse(403, 'Not a tenant admin');
  var body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON body'); }

  var tenantRes = await supabase.from('white_label_tenants').select('features').eq('id', admin.tenantId).maybeSingle();
  var features = (tenantRes.data && tenantRes.data.features) || {};
  features.approval_workflow = {
    require_provider_approval: !!body.require_provider_approval,
    require_member_approval: !!body.require_member_approval,
    auto_approve_verified: body.auto_approve_verified !== false
  };
  var updRes = await supabase.from('white_label_tenants').update({ features: features }).eq('id', admin.tenantId);
  if (updRes.error) throw new Error(updRes.error.message);
  return utils.successResponse({ success: true, approval_workflow: features.approval_workflow });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var user;
  try {
    user = await getBearerUser(event, supabase);
  } catch (e) {
    user = null;
  }
  if (!user) return utils.errorResponse(401, 'Unauthorized');

  var path = parsePath(event);
  var rosterDeleteMatch = path.match(/^roster\/([^/]+)$/);

  try {
    if (path === 'me' && event.httpMethod === 'GET') return await handleMe(event, supabase, user);
    if (path === 'roster' && event.httpMethod === 'GET') return await handleRosterList(event, supabase, user);
    if (rosterDeleteMatch && event.httpMethod === 'DELETE') return await handleRosterDelete(event, supabase, user, rosterDeleteMatch[1]);
    if (path === 'analytics' && event.httpMethod === 'GET') return await handleAnalytics(event, supabase, user);
    if (path === 'loyalty-config' && event.httpMethod === 'GET') return await handleLoyaltyGet(event, supabase, user);
    if (path === 'loyalty-config' && event.httpMethod === 'POST') return await handleLoyaltyPost(event, supabase, user);
    if (path === 'approval-workflow' && event.httpMethod === 'GET') return await handleApprovalGet(event, supabase, user);
    if (path === 'approval-workflow' && event.httpMethod === 'POST') return await handleApprovalPost(event, supabase, user);
    return utils.errorResponse(404, 'Not found');
  } catch (err) {
    console.error('[tenant-portal]', path, err.message);
    return utils.errorResponse(500, 'Failed to process request');
  }
};
