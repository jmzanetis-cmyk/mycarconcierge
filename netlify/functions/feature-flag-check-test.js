'use strict';

// GET /api/admin/feature-flag-check-test?userId=<uuid>
//
// Admin-only smoke-test endpoint. Returns the resolved flag state for both
// custody_chain_enabled and car_club_programs_enabled for the given userId.
// Omit userId to check against the authenticated admin's own ID.

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

var FLAGS = ['custody_chain_enabled', 'car_club_programs_enabled'];

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

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var admin = await authenticateBearerAdmin(event, supabase);
  if (!admin) return utils.errorResponse(401, 'Authentication required');

  var qs = event.queryStringParameters || {};
  var targetUserId = (qs.userId || '').trim() || admin.id;

  var results = {};
  await Promise.all(FLAGS.map(async function(flag) {
    results[flag] = await isFeatureEnabledForUser(supabase, flag, targetUserId);
  }));

  return utils.successResponse({
    success: true,
    userId: targetUserId,
    flags: results
  });
};
