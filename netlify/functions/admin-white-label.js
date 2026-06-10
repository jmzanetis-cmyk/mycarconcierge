// netlify/functions/admin-white-label.js
//
// Routes:
//   GET  /api/admin/white-label/tenants
//   GET  /api/admin/white-label/tenants/:id
//
// Auth: Authorization: Bearer <supabase_token|team_token>

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

  return utils.errorResponse(404, 'Not found');
};
