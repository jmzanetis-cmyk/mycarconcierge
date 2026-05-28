// Task #186 — Shared account-deletion cascade.
//
// Both the in-app delete handler (POST /api/account/delete) and the Facebook
// account-deletion callback share this module so the deletion cascade can
// never drift between the two paths. If you add a new table that holds user
// data, add the matching delete here.
//
// Inputs are passed in (rather than required globally) so this module has no
// implicit dependency on www/server.js — Netlify functions can require it
// without dragging in the entire server bundle.

async function _deleteSharedTables(supabase, userId) {
  await supabase.from('notifications').delete().eq('user_id', userId);
  await supabase.from('push_subscriptions').delete().eq('user_id', userId);
  await supabase.from('login_activity').delete().eq('user_id', userId);
  await supabase.from('two_factor_tokens').delete().eq('user_id', userId);
  await supabase.from('two_factor_rate_limits').delete().eq('user_id', userId);
  await supabase.from('dream_car_matches').delete().eq('member_id', userId);
  await supabase.from('dream_car_criteria').delete().eq('member_id', userId);
  await supabase.from('fuel_logs').delete().eq('member_id', userId);
  await supabase.from('insurance_cards').delete().eq('member_id', userId);
  await supabase.from('prospective_vehicles').delete().eq('member_id', userId);
  await supabase.from('location_shares').delete().eq('shared_by', userId);
  await supabase.from('survey_responses').delete().eq('user_id', userId);
  await supabase.from('member_car_preferences').delete().eq('user_id', userId);
}

async function _deleteProviderTables(supabase, userId) {
  await supabase.from('provider_team_members').delete().eq('provider_id', userId);
  await supabase.from('provider_reviews').delete().eq('provider_id', userId);
  await supabase.from('bids').delete().eq('provider_id', userId);
  await supabase.from('provider_stats').delete().eq('provider_id', userId);
  await supabase.from('provider_applications').delete().eq('user_id', userId);
  await supabase.from('clover_connections').delete().eq('provider_id', userId);
  await supabase.from('square_connections').delete().eq('provider_id', userId);
  await supabase.from('provider_referral_codes').delete().eq('provider_id', userId);
  const { data: founderProfile } = await supabase
    .from('member_founder_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (founderProfile) {
    await supabase.from('commission_reconciliation_queue').delete().eq('founder_id', founderProfile.id);
    await supabase.from('founder_commissions').delete().eq('founder_id', founderProfile.id);
  }
  await supabase.from('founder_referrals').delete().eq('referring_provider_id', userId);
  await supabase
    .from('bid_pack_purchases')
    .update({ provider_id: null, provider_email: 'deleted_account@deleted.com' })
    .eq('provider_id', userId);
  await supabase
    .from('escrow_payments')
    .update({ provider_id: null })
    .eq('provider_id', userId);
}

async function _deleteMemberTables(supabase, userId) {
  // --- Step 1: collect IDs needed for cascade BEFORE anonymising ---
  const { data: vehiclesRes } = await supabase.from('vehicles').select('id').eq('owner_id', userId);
  const vehicleIds = (vehiclesRes || []).map(v => v.id);

  const { data: packagesRes } = await supabase.from('maintenance_packages').select('id').eq('member_id', userId);
  const packageIds = (packagesRes || []).map(p => p.id);

  const { data: ridesRes } = await supabase.from('rides').select('id').eq('member_id', userId);
  const rideIds = (ridesRes || []).map(r => r.id);

  const { data: clubMemberships } = await supabase.from('car_club_members').select('id').eq('member_id', userId);
  const membershipIds = (clubMemberships || []).map(m => m.id);

  // --- Step 2: cancel pending driver tips (no transfer yet — prevents future payout) ---
  if (rideIds.length > 0) {
    await supabase.from('driver_tips')
      .update({ status: 'cancelled' })
      .in('ride_id', rideIds)
      .eq('status', 'pending');
  }

  // --- Step 3: anonymise financial/legal records (SET NULL) ---
  await supabase.from('rides').update({
    member_id: null,
    member_vehicle_make: null, member_vehicle_model: null,
    member_vehicle_year: null, member_vehicle_color: null,
    member_vehicle_plate: null, pickup_contact_name: null,
    pickup_contact_phone: null, dropoff_contact_name: null,
    dropoff_contact_phone: null, member_review: null,
  }).eq('member_id', userId);

  await supabase.from('concierge_jobs').update({ member_id: null }).eq('member_id', userId);
  await supabase.from('payments').update({ member_id: null }).eq('member_id', userId);
  await supabase.from('escrow_payments').update({ member_id: null }).eq('member_id', userId);
  await supabase.from('provider_reviews').update({ member_id: null }).eq('member_id', userId);
  await supabase.from('vehicle_service_history').update({ member_id: null }).eq('member_id', userId);
  await supabase.from('disputes').update({ filed_by: null }).eq('filed_by', userId);
  await supabase.from('dispute_evidence').update({ submitted_by: null }).eq('submitted_by', userId);
  // completed slot_bookings: anonymise; pending/cancelled: delete (below)
  await supabase.from('slot_bookings')
    .update({ member_id: null, member_notes: null })
    .eq('member_id', userId)
    .in('status', ['completed', 'confirmed']);
  await supabase.from('merch_orders')
    .update({ member_id: null, shipping_address: 'DELETED' })
    .eq('member_id', userId);

  // --- Step 4: vehicle cascade ---
  if (vehicleIds.length > 0) {
    await supabase.from('service_history').delete().in('vehicle_id', vehicleIds);
    await supabase.from('maintenance_reminders').delete().in('vehicle_id', vehicleIds);
    await supabase.from('recall_alerts').delete().in('vehicle_id', vehicleIds);
    await supabase.from('vehicle_recalls').delete().in('vehicle_id', vehicleIds);
    await supabase.from('registration_verifications').delete().in('vehicle_id', vehicleIds);
    await supabase.from('vehicle_driving_conditions').delete().in('vehicle_id', vehicleIds);
  }
  // insurance_verifications has both vehicle_id and user_id references; delete both paths
  await supabase.from('insurance_verifications').delete().eq('user_id', userId);
  await supabase.from('vehicles').delete().eq('owner_id', userId);

  // --- Step 5: package cascade ---
  if (packageIds.length > 0) {
    await supabase.from('bids').delete().in('package_id', packageIds);
    await supabase.from('additional_work_requests').delete().in('package_id', packageIds);
    await supabase.from('provider_discounts').delete().in('package_id', packageIds);
  }
  await supabase.from('maintenance_packages').delete().eq('member_id', userId);

  // --- Step 6: car clubs ---
  if (membershipIds.length > 0) {
    await supabase.from('member_club_balances').delete().in('membership_id', membershipIds);
  }
  await supabase.from('car_club_members').delete().eq('member_id', userId);
  await supabase.from('car_club_redemptions').delete().eq('member_id', userId);
  await supabase.from('car_club_return_bonuses').delete().eq('member_id', userId);

  // --- Step 7: identity / KYC ---
  await supabase.from('identity_verifications').delete().eq('user_id', userId);
  await supabase.from('insurance_documents').delete().eq('member_id', userId);

  // --- Step 8: remaining PII tables ---
  await supabase.from('diagnostic_sessions').delete().eq('member_id', userId);
  await supabase.from('car_evaluations').delete().eq('member_id', userId);
  await supabase.from('emergency_dispatch_requests').delete().eq('member_id', userId);
  await supabase.from('checkin_queue').delete().eq('member_id', userId);
  await supabase.from('checkin_sessions').delete().eq('customer_id', userId);
  await supabase.from('urgent_updates').delete().eq('member_id', userId);
  await supabase.from('slot_bookings').delete().eq('member_id', userId)
    .in('status', ['pending', 'cancelled', 'no_show']);
  await supabase.from('community_posts').delete().eq('author_id', userId);
  await supabase.from('member_credits').delete().eq('member_id', userId);
  await supabase.from('member_notification_preferences').delete().eq('member_id', userId);
  await supabase.from('member_founder_profiles').delete().eq('user_id', userId);
  await supabase.from('member_founder_applications').delete().eq('user_id', userId);
  await supabase.from('household_members').delete().eq('user_id', userId);
  await supabase.from('support_tickets').delete().eq('user_id', userId);
  await supabase.from('crowd_fund_contributions').delete().eq('contributor_id', userId);
  await supabase.from('destination_services').delete().eq('requested_by', userId);
  await supabase.from('maintenance_schedules').delete().eq('member_id', userId);
  await supabase.from('service_reminders').delete().eq('member_id', userId);

  // Referrals: delete inbound (this user was referred by someone — remove their record);
  // rows where referrer_id = userId are historical attribution records with no FK
  // constraint and no PII — leave them intact.
  await supabase.from('referrals').delete().eq('referred_id', userId);
}

async function _cancelStripeSubscriptions(stripe, supabase, userId) {
  if (!stripe) return;
  const { data: subs } = await supabase
    .from('saas_subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due']);
  for (const sub of (subs || [])) {
    if (!sub.stripe_subscription_id) continue;
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (e) {
      console.warn('[account-delete] stripe sub cancel failed:', sub.stripe_subscription_id, e.message);
    }
  }
}

async function _deleteAuthAndNotify(opts, displayName) {
  const supabase = opts.supabase;
  const serviceSupabase = opts.serviceSupabase || opts.supabase;
  const userId = opts.userId;
  const userEmail = opts.userEmail;
  const requestId = opts.requestId;
  const source = opts.source;
  const sendEmail = opts.sendEmail;

  await supabase.from('referral_code_usages').delete().eq('referred_user_id', userId);
  await supabase.from('messages').delete().eq('sender_id', userId);
  await supabase.from('messages').delete().eq('receiver_id', userId);
  // signed_agreements: capture signer email BEFORE breaking the user_id link so
  // the legal record survives deletion with full identity (name already stored in
  // full_name column; email stamped here).
  if (userEmail) {
    await supabase.from('signed_agreements')
      .update({ signer_email_snapshot: userEmail })
      .eq('user_id', userId);
  }
  await supabase.from('signed_agreements').update({ user_id: null }).eq('user_id', userId);
  // sms_opt_out_log: unlink the profile reference but keep the opt-out record
  await supabase.from('sms_opt_out_log').update({ matched_profile_id: null }).eq('matched_profile_id', userId);
  await supabase.from('profiles').delete().eq('id', userId);

  if (serviceSupabase?.auth?.admin && typeof serviceSupabase.auth.admin.deleteUser === 'function') {
    const authDelRes = await serviceSupabase.auth.admin.deleteUser(userId);
    if (authDelRes?.error) {
      console.error('[' + requestId + '] auth.admin.deleteUser error:', authDelRes.error);
    }
  }

  if (sendEmail && userEmail) {
    try {
      await sendEmail({
        to: userEmail,
        subject: 'Your My Car Concierge Account Has Been Deleted',
        html: buildDeletionEmailHtml(displayName, source),
      });
    } catch (emailError) {
      console.error('[' + requestId + '] Failed to send deletion confirmation email:', emailError);
    }
  }
}

async function performAccountDeletion(opts) {
  const supabase = opts.supabase;
  const stripe = opts.stripe || null;
  const userId = opts.userId;
  const userEmail = opts.userEmail;
  const requestId = opts.requestId || 'noreq';
  const source = opts.source || 'in_app';
  const sendEmail = typeof opts.sendEmail === 'function' ? opts.sendEmail : null;

  if (!supabase) return { success: false, statusCode: 500, error: 'Database not configured' };
  if (!userId)   return { success: false, statusCode: 400, error: 'Missing userId' };

  try {
    console.log('[' + requestId + '] Account deletion requested for user ' + userId +
      ' (' + (userEmail || 'unknown email') + ') via ' + source);

    const profileRes = await supabase
      .from('profiles')
      .select('role, full_name, business_name')
      .eq('id', userId)
      .maybeSingle();
    const profile = profileRes?.data || null;
    const isProvider = profile && (profile.role === 'provider' || profile.role === 'pending_provider');
    const displayName = (profile && (profile.business_name || profile.full_name)) || userEmail || 'there';

    // Cancel Stripe subscriptions before removing DB records
    await _cancelStripeSubscriptions(stripe, supabase, userId);

    await _deleteSharedTables(supabase, userId);
    if (isProvider) {
      await _deleteProviderTables(supabase, userId);
    } else {
      await _deleteMemberTables(supabase, userId);
    }
    await _deleteAuthAndNotify(
      Object.assign({}, opts, { requestId, source, sendEmail }),
      displayName,
    );

    console.log('[' + requestId + '] Account deletion completed for user ' + userId);
    return { success: true };
  } catch (error) {
    console.error('[' + requestId + '] Account deletion error:', error);
    return {
      success: false,
      statusCode: 500,
      error: error?.message || 'Failed to delete account. Please try again or contact support.',
    };
  }
}

function buildDeletionEmailHtml(displayName, source) {
  const reasonClause = source === 'facebook_callback'
    ? ' because you removed the My Car Concierge app from your Facebook account'
    : ' as requested';
  return ''
    + '<div style="font-family: \'Outfit\', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #fefdfb;">'
    +   '<div style="text-align: center; margin-bottom: 30px;">'
    +     '<img src="https://mycarconcierge.com/icons/mcc-logo-full.png" alt="My Car Concierge" style="height: 50px;">'
    +   '</div>'
    +   '<h1 style="color: #1e3a5f; font-size: 24px; margin-bottom: 20px;">Account Deleted</h1>'
    +   '<p style="color: #4b5563; line-height: 1.6;">Hello ' + escapeHtml(displayName) + ',</p>'
    +   '<p style="color: #4b5563; line-height: 1.6;">Your My Car Concierge account has been permanently deleted'
    +     reasonClause + '. All your personal data has been removed from our systems.</p>'
    +   '<p style="color: #4b5563; line-height: 1.6;">If you did not request this deletion, please contact us immediately at support@mycarconcierge.com.</p>'
    +   '<p style="color: #4b5563; line-height: 1.6; margin-top: 30px;">Thank you for being part of My Car Concierge. We hope to see you again in the future.</p>'
    +   '<p style="color: #4b5563; line-height: 1.6;">Best regards,<br>The My Car Concierge Team</p>'
    + '</div>';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

module.exports = { performAccountDeletion };
