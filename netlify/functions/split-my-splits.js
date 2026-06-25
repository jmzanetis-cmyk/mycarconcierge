'use strict';

// GET /api/split/my-splits
// Auth: Bearer JWT (member)
// Returns:
//   organized: split_payments created by this user, with participants + package title
//   invited:   split_participants rows where this user is a participant

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return utils.errorResponse(401, 'Authorization required');
  var token = authHeader.slice(7).trim();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data?.user) return utils.errorResponse(401, 'Invalid or expired auth token');
  var userId = userResult.data.user.id;

  // Feature gate (ships dark for launch) — return empty lists rather than 403
  // so the "My Splits" surface degrades gracefully when off.
  var spEnabled = await isFeatureEnabledForUser(supabase, 'split_payments_enabled', userId);
  if (!spEnabled) return utils.successResponse({ organized: [], invited: [] });

  var [organizedRes, invitedRes] = await Promise.all([
    supabase
      .from('split_payments')
      .select('id, total_amount_cents, status, expires_at, created_at, package_id, maintenance_packages(title, service_type, member_zip), split_participants(id, email, display_name, amount_cents, status, member_id, paid_at)')
      .eq('created_by', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('split_participants')
      .select('id, email, display_name, amount_cents, status, paid_at, split_payment_id, split_payments(id, total_amount_cents, status, expires_at, package_id, created_by, maintenance_packages(title, service_type))')
      .eq('member_id', userId)
      .order('invited_at', { ascending: false })
  ]);

  if (organizedRes.error) {
    console.error('[split-my-splits] organized query:', organizedRes.error.message);
    return utils.errorResponse(500, 'Failed to load organized splits');
  }
  if (invitedRes.error) {
    console.error('[split-my-splits] invited query:', invitedRes.error.message);
    return utils.errorResponse(500, 'Failed to load invited splits');
  }

  var organized = (organizedRes.data || []).map(s => ({
    id: s.id,
    total_amount_cents: s.total_amount_cents,
    status: s.status,
    expires_at: s.expires_at,
    created_at: s.created_at,
    pkg: s.maintenance_packages || null,
    participants: s.split_participants || []
  }));

  var invited = (invitedRes.data || []).map(p => ({
    participant_id: p.id,
    email: p.email,
    display_name: p.display_name,
    amount_cents: p.amount_cents,
    status: p.status,
    paid_at: p.paid_at,
    split: p.split_payments || null
  }));

  return utils.successResponse({ organized, invited });
};
