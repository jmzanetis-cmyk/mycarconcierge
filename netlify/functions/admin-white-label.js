// netlify/functions/admin-white-label.js
//
// Routes:
//   GET  /api/admin/white-label/tenants
//   GET  /api/admin/white-label/tenants/:id
//   GET  /api/admin/white-label/applications           -- 2026-09-11
//   GET  /api/admin/white-label/applications/:id        -- 2026-09-11
//
// Auth: Authorization: Bearer <supabase_token|team_token>
//
// applications routes surface white_label_applications so Jordan can see
// pending/provisioned/failed self-serve tenancy applications (see
// white-label-apply.js + stripe-webhook.js's provisioning branch) --
// especially 'failed' ones, where a customer paid but automatic
// provisioning hit an error (e.g. a subdomain race) and needs manual
// follow-up.

'use strict';

const utils = require('./utils');

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/admin-white-label\/?/, '')
    .replace(/^\/api\/admin\/white-label\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const caller = await utils.authenticateBearerAdminOrTeam(event, supabase);
  if (!caller) return utils.errorResponse(401, 'Unauthorized');

  const path = parsePath(event);

  if (path === 'tenants' || path === '') {
    const { data: tenants, error } = await supabase
      .from('white_label_tenants')
      .select('id, name, domain, subdomain, brand_name, logo_url, plan, status, max_members, max_providers, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) return utils.errorResponse(500, error.message);
    return utils.successResponse({ tenants: tenants || [] });
  }

  const tenantMatch = path.match(/^tenants\/([^/]+)$/);
  if (tenantMatch) {
    const { data: tenant, error } = await supabase
      .from('white_label_tenants')
      .select('*')
      .eq('id', tenantMatch[1])
      .maybeSingle();
    if (error) return utils.errorResponse(500, error.message);
    if (!tenant) return utils.errorResponse(404, 'Tenant not found');
    return utils.successResponse({ tenant });
  }

  if (path === 'applications') {
    const { data: applications, error } = await supabase
      .from('white_label_applications')
      .select('id, user_id, business_name, subdomain, plan, billing, status, failure_reason, stripe_session_id, tenant_id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) return utils.errorResponse(500, error.message);
    return utils.successResponse({ applications: applications || [] });
  }

  const applicationMatch = path.match(/^applications\/([^/]+)$/);
  if (applicationMatch) {
    const { data: application, error } = await supabase
      .from('white_label_applications')
      .select('*')
      .eq('id', applicationMatch[1])
      .maybeSingle();
    if (error) return utils.errorResponse(500, error.message);
    if (!application) return utils.errorResponse(404, 'Application not found');
    return utils.successResponse({ application });
  }

  return utils.errorResponse(404, 'Not found');
};
