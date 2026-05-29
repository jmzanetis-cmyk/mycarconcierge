'use strict';

// GET /api/me/feature-flags
//
// Returns resolved feature flag values for the authenticated member.
// Unlike /api/admin/feature-flag-check-test, this endpoint accepts any
// authenticated user (not admin-only) and resolves flags for the caller.
//
// Response: { success: true, flags: { custody_chain_enabled: bool, ... } }

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

var FLAGS = ['custody_chain_enabled', 'car_club_programs_enabled'];

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return utils.errorResponse(401, 'Authentication required');
  var token = authHeader.slice(7).trim();
  if (!token) return utils.errorResponse(401, 'Authentication required');

  var authResult = await supabase.auth.getUser(token);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return utils.errorResponse(401, 'Authentication required');

  var results = {};
  await Promise.all(FLAGS.map(async function(flag) {
    results[flag] = await isFeatureEnabledForUser(supabase, flag, user.id);
  }));

  return utils.successResponse({ success: true, flags: results });
};
