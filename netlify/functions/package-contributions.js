// GET /api/packages/:id/contributions — total raised + contributor list for a crowd-funded package
'use strict';
let utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  try {
    let packageId = utils.extractPathParam(event.path);
    if (!utils.isValidUUID(packageId)) return utils.errorResponse(400, 'Invalid package ID');

    let authHeader = event.headers && (event.headers.authorization || event.headers.Authorization);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return utils.errorResponse(401, 'Authorization required');
    }

    let token = authHeader.slice(7).trim();
    let supabase = utils.createSupabaseClient();
    if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

    let userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data || !userResult.data.user) {
      return utils.errorResponse(401, 'Invalid token');
    }

    let pkgResult = await supabase
      .from('maintenance_packages')
      .select('id, crowd_funded')
      .eq('id', packageId)
      .single();

    if (pkgResult.error || !pkgResult.data) return utils.errorResponse(404, 'Package not found');
    if (!pkgResult.data.crowd_funded) return utils.errorResponse(400, 'Package is not crowd-funded');

    let contribResult = await supabase
      .from('crowd_fund_contributions')
      .select('id, amount_cents, created_at, contributor_id, profiles(first_name, full_name)')
      .eq('package_id', packageId)
      .order('created_at', { ascending: false });

    if (contribResult.error) {
      console.error('package-contributions GET error:', contribResult.error.message);
      return utils.errorResponse(500, 'Failed to load contributions');
    }

    let contributions = contribResult.data || [];
    let total_cents = contributions.reduce(function(sum, c) { return sum + (c.amount_cents || 0); }, 0);

    return utils.successResponse({
      package_id: packageId,
      total_cents: total_cents,
      count: contributions.length,
      contributions: contributions.map(function(c) {
        return {
          id: c.id,
          amount_cents: c.amount_cents,
          created_at: c.created_at,
          contributor_first_name: c.profiles && c.profiles.first_name || null,
          contributor_name: c.profiles && c.profiles.full_name || null,
        };
      }),
    });
  } catch (err) {
    console.error('package-contributions error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};
