'use strict';

// POST /api/split/reactivate/:splitId
// Auth: Bearer JWT (must be the split's creator)
// Body: { participants: [{email, amount_cents, display_name?, is_guest?}] }
//
// Re-invites participants on an expired or cancelled split without changing
// its total. Ported from server.js's handleSplitReactivate (see
// split-status.js's header comment on why this was 404ing in prod).
//
// Deliberately does NOT touch Stripe or the care plan's own
// stripe_payment_intent_id -- reactivate only ever re-populates
// split_participants and flips the split back to 'pending'; each
// participant's own PaymentIntent is created lazily when THEY pay (see
// split-pay.js / split-guest-pay.js), same as the very first time the split
// was created. It does re-link care_plans.split_payment_id and put
// payment_status back to 'pending_split_payment' in case the plan was reset
// by a prior split-cancel.js call.
//
// Not ported: the original's crowd-funded "additional work" branch (a
// shorter 2-hour expiry when the split was for approved additional work
// rather than the initial job). That flow was never ported off
// maintenance_packages in the first place -- see split-create.js's header
// comment -- so every reactivated care-plan split just gets the standard
// 72-hour window.

var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return utils.errorResponse(401, 'Authorization required');
  var token = authHeader.slice(7).trim();

  var splitId = utils.extractPathParam(event.path);
  if (!splitId || !utils.isValidUUID(splitId))
    return utils.errorResponse(400, 'Invalid split payment ID');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data?.user) return utils.errorResponse(401, 'Invalid or expired auth token');
  var userId = userResult.data.user.id;

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }

  var participants = Array.isArray(body.participants) ? body.participants : [];
  if (participants.length < 2)
    return utils.errorResponse(400, 'At least 2 participants are required');
  for (var p of participants) {
    if (!p.email || typeof p.amount_cents !== 'number' || p.amount_cents < 50)
      return utils.errorResponse(400, 'Each participant must contribute at least $0.50');
  }

  var splitRes = await supabase.from('split_payments').select('*').eq('id', splitId).single();
  if (splitRes.error || !splitRes.data) return utils.errorResponse(404, 'Split payment not found');
  var splitPayment = splitRes.data;

  if (splitPayment.created_by !== userId)
    return utils.errorResponse(403, 'Only the creator can reactivate a split payment');
  if (!['expired', 'cancelled'].includes(splitPayment.status))
    return utils.errorResponse(400, `Cannot reactivate split payment in ${splitPayment.status} status. Only expired or cancelled splits can be reactivated.`);

  var participantTotal = participants.reduce((sum, p) => sum + p.amount_cents, 0);
  if (participantTotal !== splitPayment.total_amount_cents)
    return utils.errorResponse(400, `Participant amounts ($${(participantTotal / 100).toFixed(2)}) must equal split total ($${(splitPayment.total_amount_cents / 100).toFixed(2)})`);

  var emails = participants.map(p => p.email.toLowerCase());
  var profilesRes = await supabase.from('profiles').select('id, email').in('email', emails);
  var emailToMemberId = {};
  if (profilesRes.data) {
    for (var profile of profilesRes.data) emailToMemberId[profile.email.toLowerCase()] = profile.id;
  }

  var participantRecords = participants.map(p => ({
    split_payment_id: splitId,
    member_id: p.is_guest ? null : (emailToMemberId[p.email.toLowerCase()] || null),
    email: p.email.toLowerCase(),
    display_name: p.display_name || null,
    amount_cents: p.amount_cents,
    status: 'invited',
    invited_at: new Date().toISOString(),
  }));

  await supabase.from('split_participants').delete().eq('split_payment_id', splitId);

  var insertRes = await supabase.from('split_participants').insert(participantRecords).select();
  if (insertRes.error) {
    console.error('[split-reactivate] participants insert:', insertRes.error.message);
    await supabase.from('split_payments').update({ status: splitPayment.status, updated_at: new Date().toISOString() }).eq('id', splitId);
    return utils.errorResponse(500, 'Failed to create split participants');
  }
  var createdParticipants = insertRes.data || [];

  var expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  await supabase.from('split_payments').update({ status: 'pending', expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', splitId);

  var carePlanId = splitPayment.package_id;
  var plan = null;
  if (carePlanId) {
    await supabase.from('care_plans').update({
      payment_status: 'pending_split_payment',
      split_payment_id: splitId,
      updated_at: new Date().toISOString(),
    }).eq('id', carePlanId);

    var planRes = await supabase.from('care_plans').select('title, provider_id').eq('id', carePlanId).single();
    plan = planRes.data;

    if (plan && plan.provider_id) {
      await supabase.from('notifications').insert({
        user_id: plan.provider_id,
        type: 'split_payment_created',
        title: 'Split Payment Reactivated',
        message: `A split payment has been reactivated for "${plan.title || 'a service'}". Please do not begin work until all participants have completed payment. You will be notified when everything is ready.`,
        entity_type: 'care_plan',
        entity_id: carePlanId,
      });
    }
  }

  for (var cp of createdParticipants) {
    if (cp.member_id) {
      await supabase.from('notifications').insert({
        user_id: cp.member_id,
        type: 'split_payment_invite',
        title: 'Split Payment Invitation',
        message: `You've been invited to share the cost of "${(plan && plan.title) || 'a service'}". Your share: $${(cp.amount_cents / 100).toFixed(2)}`,
        entity_type: 'split_payment',
        entity_id: splitId,
      });
    }
  }

  var participantsOut = createdParticipants.map(p => ({
    id: p.id,
    email: p.email,
    amount_cents: p.amount_cents,
    is_member: !!p.member_id,
    invite_token: p.member_id ? null : utils.generateGuestToken(p.id),
  }));

  return utils.successResponse({ success: true, split_id: splitId, participants: participantsOut });
};
