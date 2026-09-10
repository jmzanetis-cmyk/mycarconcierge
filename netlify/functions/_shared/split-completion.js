'use strict';

// Shared "mark a split participant paid, and if that closes out the split,
// finish it" logic. Both split-confirm.js (member path) and
// split-guest-confirm.js (guest path) call this after establishing the
// participant actually paid (member path trusts the caller post-Stripe
// confirm, same as before; guest path re-verifies the PaymentIntent via
// Stripe first) -- this module does not talk to Stripe itself, so the same
// helper also backs the reviewer-mock branches in split-pay.js /
// split-guest-pay.js, which never create a real PaymentIntent at all.
//
// Originally split-guest-confirm.js had all the "split just finished" side
// effects (package status update + provider/organizer notifications) while
// split-confirm.js (member path) had none of them -- a real gap: if the LAST
// participant to pay was a member rather than a guest, the job never moved
// out of pending_split_payment and nobody was notified. Fixed by unifying
// both onto this helper.
//
// Ported onto care_plans (maintenance_packages/bids are retired). The
// separate "crowd-fund additional work" flow (additional_work_requests
// auto-approval) is intentionally NOT handled here -- that's a distinct,
// still-unported feature (see www/index.html's separate "Crowd-Funded
// Repairs" pill) and out of scope for this pass.

async function completeSplitParticipant(supabase, participantId) {
  var partRes = await supabase
    .from('split_participants')
    .select('id, status, split_payment_id')
    .eq('id', participantId)
    .single();
  if (partRes.error || !partRes.data) return { error: 'not_found' };
  var participant = partRes.data;

  if (participant.status === 'paid') {
    return { success: true, alreadyPaid: true, splitComplete: false };
  }

  var updRes = await supabase
    .from('split_participants')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', participantId);
  if (updRes.error) {
    console.error('[split-completion] update participant:', updRes.error.message);
    return { error: 'update_failed' };
  }

  var allPartsRes = await supabase
    .from('split_participants')
    .select('id, status')
    .eq('split_payment_id', participant.split_payment_id);

  var allPaid = !!(allPartsRes.data && allPartsRes.data.every(function (p) {
    return p.id === participantId || p.status === 'paid';
  }));

  if (!allPaid) {
    return { success: true, splitComplete: false };
  }

  var splitRes = await supabase
    .from('split_payments')
    .select('id, package_id, total_amount_cents, created_by')
    .eq('id', participant.split_payment_id)
    .single();
  var splitPaymentData = splitRes.data || {};
  var carePlanId = splitPaymentData.package_id; // holds a care_plans.id for splits created via split-create.js

  await supabase
    .from('split_payments')
    .update({ status: 'complete', updated_at: new Date().toISOString() })
    .eq('id', participant.split_payment_id);

  if (!carePlanId) {
    return { success: true, splitComplete: true };
  }

  // Every participant PI is capture_method:'automatic', so funds for each
  // share are already captured/transferred -- this just closes out the
  // plan's payment state to the same "held" precondition care-plans.js's
  // handleComplete already checks on the main (non-split) path, so the
  // member sees the "Mark Complete" panel instead of the authorize-card one.
  var planUpd = await supabase.from('care_plans').update({
    payment_status: 'held',
    split_payment_id: participant.split_payment_id,
    updated_at: new Date().toISOString(),
  }).eq('id', carePlanId);
  if (planUpd.error) console.error('[split-completion] care_plans update failed:', planUpd.error.message);

  if (splitPaymentData.created_by) {
    await supabase.from('notifications').insert({
      user_id: splitPaymentData.created_by,
      type: 'split_payment_complete',
      title: 'Split Payment Complete!',
      message: 'All participants have paid their share. The service can now proceed.',
      entity_type: 'split_payment',
      entity_id: participant.split_payment_id,
    });
  }

  var planRowRes = await supabase
    .from('care_plans')
    .select('accepted_bid_id, provider_id, title')
    .eq('id', carePlanId)
    .single();
  var planRow = planRowRes.data;

  if (planRow && planRow.provider_id) {
    await supabase.from('notifications').insert({
      user_id: planRow.provider_id,
      type: 'payment_received',
      title: 'Payment Received',
      message: 'The split payment for "' + (planRow.title || 'a service') + '" has been completed. You can now begin the service.',
      entity_type: 'care_plan',
      entity_id: carePlanId,
    });
  }

  return { success: true, splitComplete: true };
}

module.exports = { completeSplitParticipant };
