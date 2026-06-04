'use strict';

// POST /api/split/confirm/:participantId
// Auth: Bearer JWT (member)
// Called after Stripe payment succeeds on the split-pay page.
// Updates the participant status to 'paid', checks if all participants have
// paid, and if so marks the split_payment as 'complete'.
// Returns: { success, splitComplete }

var utils = require('./utils');

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

  // Load the participant and its parent split
  var partRes = await supabase
    .from('split_participants')
    .select('id, member_id, status, split_payment_id')
    .eq('id', participantId)
    .single();
  if (partRes.error || !partRes.data) return utils.errorResponse(404, 'Participant not found');
  var participant = partRes.data;

  if (participant.member_id !== userId)
    return utils.errorResponse(403, 'This payment belongs to a different user');
  if (participant.status === 'paid')
    return utils.successResponse({ success: true, splitComplete: false, alreadyPaid: true });

  // Mark participant as paid
  var updPartRes = await supabase
    .from('split_participants')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', participantId);
  if (updPartRes.error) {
    console.error('[split-confirm] update participant:', updPartRes.error.message);
    return utils.errorResponse(500, 'Failed to update payment status');
  }

  // Check if all participants in this split have now paid
  var allPartsRes = await supabase
    .from('split_participants')
    .select('id, status')
    .eq('split_payment_id', participant.split_payment_id);

  var splitComplete = false;
  if (allPartsRes.data && allPartsRes.data.every(p => p.id === participantId || p.status === 'paid')) {
    // All participants paid — mark the split as complete
    await supabase
      .from('split_payments')
      .update({ status: 'complete' })
      .eq('id', participant.split_payment_id);
    splitComplete = true;
  }

  return utils.successResponse({ success: true, splitComplete });
};
