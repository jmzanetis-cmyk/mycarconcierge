'use strict';

// GET /api/split/status/:carePlanId
// Auth: Bearer JWT (creator or a participant)
//
// Ported from server.js's handleSplitStatus (never made it into
// netlify/functions during the Express -> Netlify migration -- this
// endpoint has simply 404'd since then). Powers the split-payment status
// card on the live care-plan checkout screen (members-care-plans.js).
//
// The original Express handler used session-based enforce2fa auth and never
// sent Authorization headers from the frontend fetch -- that's carried
// forward as a frontend bug to fix alongside wiring up the new status card,
// not something this endpoint can paper over.

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return utils.errorResponse(401, 'Authorization required');
  var token = authHeader.slice(7).trim();

  var carePlanId = utils.extractPathParam(event.path);
  if (!carePlanId || !utils.isValidUUID(carePlanId))
    return utils.errorResponse(400, 'Invalid care plan ID');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data?.user) return utils.errorResponse(401, 'Invalid or expired auth token');
  var user = userResult.data.user;

  var splitRes = await supabase
    .from('split_payments')
    .select('*')
    .eq('package_id', carePlanId)
    .in('status', ['pending', 'complete', 'expired', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(1);

  var splitPayment = splitRes.data && splitRes.data[0];
  if (splitRes.error || !splitPayment)
    return utils.errorResponse(404, 'No split payment found for this care plan');

  // Feature gate (ships dark for launch) — resolve via the split's creator,
  // same as the other split-* endpoints.
  var spEnabled = await isFeatureEnabledForUser(supabase, 'split_payments_enabled', splitPayment.created_by);
  if (!spEnabled) return utils.errorResponse(403, 'feature_disabled');

  var partsRes = await supabase
    .from('split_participants')
    .select('*')
    .eq('split_payment_id', splitPayment.id)
    .order('created_at', { ascending: true });
  var participants = partsRes.data || [];

  var isCreator = splitPayment.created_by === user.id;
  var isParticipant = participants.some(p => p.member_id === user.id || (p.email && user.email && p.email.toLowerCase() === user.email.toLowerCase()));

  if (!isCreator && !isParticipant)
    return utils.errorResponse(403, 'Not authorized to view this split payment');

  var planRes = await supabase.from('care_plans').select('title, status, payment_status').eq('id', carePlanId).single();
  var plan = planRes.data || {};

  var creatorRes = await supabase.from('profiles').select('full_name, email').eq('id', splitPayment.created_by).single();
  var creatorProfile = creatorRes.data || {};

  return utils.successResponse({
    splitPayment: splitPayment,
    participants: participants,
    planTitle: plan.title || 'Auto Service',
    planStatus: plan.status || null,
    planPaymentStatus: plan.payment_status || null,
    creatorName: creatorProfile.full_name || creatorProfile.email || 'Unknown',
    isCreator: isCreator,
  });
};
