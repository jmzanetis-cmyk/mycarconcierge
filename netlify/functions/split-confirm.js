'use strict';

// POST /api/split/confirm/:participantId
// Auth: Bearer JWT (member)
// Called after Stripe payment succeeds on the split-pay page.
// Updates the participant status to 'paid', checks if all participants have
// paid, and if so marks the split_payment as 'complete' and (unified with
// split-guest-confirm.js via _shared/split-completion.js) runs the same
// care_plans + notification side effects regardless of whether the LAST
// payer was a member or a guest.
// Returns: { success, splitComplete }

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');
var { completeSplitParticipant } = require('./_shared/split-completion');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return utils.errorResponse(401, 'Authorization required');
  var token = authHeader.slice(7).trim();

  var participantId = utils.extractPathParam(event.path);
  if (!participantId || !utils.isValidUUID(participantId))
    return utils.errorResponse(400, 'Invalid participant ID');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data?.user) return utils.errorResponse(401, 'Invalid or expired auth token');
  var userId = userResult.data.user.id;

  // Feature gate (ships dark for launch)
  var spEnabled = await isFeatureEnabledForUser(supabase, 'split_payments_enabled', userId);
  if (!spEnabled) return utils.errorResponse(403, 'feature_disabled');

  // Load the participant to check ownership before touching it
  var partRes = await supabase
    .from('split_participants')
    .select('id, member_id, status')
    .eq('id', participantId)
    .single();
  if (partRes.error || !partRes.data) return utils.errorResponse(404, 'Participant not found');
  if (partRes.data.member_id !== userId)
    return utils.errorResponse(403, 'This payment belongs to a different user');

  var result = await completeSplitParticipant(supabase, participantId);
  if (result.error === 'not_found') return utils.errorResponse(404, 'Participant not found');
  if (result.error) return utils.errorResponse(500, 'Failed to update payment status');

  return utils.successResponse({ success: true, splitComplete: !!result.splitComplete, alreadyPaid: !!result.alreadyPaid });
};
