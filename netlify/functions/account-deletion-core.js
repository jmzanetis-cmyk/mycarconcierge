// Task #186 — Shared account-deletion cascade.
//
// Both the in-app delete handler (POST /api/account/delete in www/server.js)
// and the Facebook account-deletion callback (POST /api/auth/facebook/data-deletion,
// served from www/server.js in dev and netlify/functions/facebook-data-deletion.js
// in prod) call into this module so the deletion cascade can never drift
// between the two paths. If you add a new table that holds user data, add the
// matching delete here.
//
// Inputs are passed in (rather than required globally) so this module has no
// implicit dependency on www/server.js — Netlify functions can require it
// without dragging in the entire server bundle.

async function _deleteSharedTables(supabase, userId) {
  await supabase.from('notifications').delete().eq('user_id', userId);
  await supabase.from('push_subscriptions').delete().eq('user_id', userId);
  await supabase.from('login_activity').delete().eq('user_id', userId);
  await supabase.from('two_factor_tokens').delete().eq('user_id', userId);
  await supabase.from('dream_car_matches').delete().eq('member_id', userId);
  await supabase.from('dream_car_criteria').delete().eq('member_id', userId);
  await supabase.from('fuel_logs').delete().eq('member_id', userId);
  await supabase.from('insurance_cards').delete().eq('member_id', userId);
  await supabase.from('prospective_vehicles').delete().eq('member_id', userId);
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
  await supabase.from('founder_commissions').delete().eq('founder_id', userId);
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
  await supabase.from('member_founder_profiles').delete().eq('member_id', userId);

  let vehiclesRes = await supabase
    .from('vehicles')
    .select('id')
    .eq('owner_id', userId);
  let vehicleIds = (vehiclesRes && vehiclesRes.data ? vehiclesRes.data : []).map(function (v) { return v.id; });
  if (vehicleIds.length > 0) {
    await supabase.from('service_history').delete().in('vehicle_id', vehicleIds);
    await supabase.from('maintenance_reminders').delete().in('vehicle_id', vehicleIds);
    await supabase.from('recall_alerts').delete().in('vehicle_id', vehicleIds);
  }
  await supabase.from('vehicles').delete().eq('owner_id', userId);

  let packagesRes = await supabase
    .from('maintenance_packages')
    .select('id')
    .eq('member_id', userId);
  let packageIds = (packagesRes && packagesRes.data ? packagesRes.data : []).map(function (p) { return p.id; });
  if (packageIds.length > 0) {
    await supabase.from('bids').delete().in('package_id', packageIds);
    await supabase.from('additional_work_requests').delete().in('package_id', packageIds);
    await supabase.from('provider_discounts').delete().in('package_id', packageIds);
  }
  await supabase.from('maintenance_packages').delete().eq('member_id', userId);

  await supabase
    .from('escrow_payments')
    .update({ member_id: null })
    .eq('member_id', userId);
  await supabase
    .from('merch_orders')
    .update({ member_id: null, shipping_address: 'DELETED' })
    .eq('member_id', userId);
}

async function _deleteAuthAndNotify(opts, displayName) {
  let supabase = opts.supabase;
  let serviceSupabase = opts.serviceSupabase || opts.supabase;
  let userId = opts.userId;
  let userEmail = opts.userEmail;
  let requestId = opts.requestId;
  let source = opts.source;
  let sendEmail = opts.sendEmail;

  await supabase.from('referral_code_usages').delete().eq('referred_user_id', userId);
  await supabase.from('messages').delete().eq('sender_id', userId);
  await supabase.from('messages').delete().eq('receiver_id', userId);
  await supabase.from('signed_agreements').delete().eq('user_id', userId);
  await supabase.from('profiles').delete().eq('id', userId);

  if (serviceSupabase && serviceSupabase.auth && serviceSupabase.auth.admin && typeof serviceSupabase.auth.admin.deleteUser === 'function') {
    let authDelRes = await serviceSupabase.auth.admin.deleteUser(userId);
    if (authDelRes && authDelRes.error) {
      console.error('[' + requestId + '] auth.admin.deleteUser error:', authDelRes.error);
    }
  }

  if (sendEmail && userEmail) {
    try {
      await sendEmail({
        to: userEmail,
        subject: 'Your My Car Concierge Account Has Been Deleted',
        html: buildDeletionEmailHtml(displayName, source)
      });
      console.log('[' + requestId + '] Account deletion confirmation email sent to ' + userEmail);
    } catch (emailError) {
      console.error('[' + requestId + '] Failed to send deletion confirmation email:', emailError);
    }
  }
}

async function performAccountDeletion(opts) {
  let supabase = opts.supabase;
  let userId = opts.userId;
  let userEmail = opts.userEmail;
  let requestId = opts.requestId || 'noreq';
  let source = opts.source || 'in_app';
  let sendEmail = typeof opts.sendEmail === 'function' ? opts.sendEmail : null;

  if (!supabase) {
    return { success: false, statusCode: 500, error: 'Database not configured' };
  }
  if (!userId) {
    return { success: false, statusCode: 400, error: 'Missing userId' };
  }

  try {
    console.log('[' + requestId + '] Account deletion requested for user ' + userId + ' (' + (userEmail || 'unknown email') + ') via ' + source);

    let profileRes = await supabase
      .from('profiles')
      .select('role, full_name, business_name')
      .eq('id', userId)
      .maybeSingle();
    let profile = profileRes && profileRes.data ? profileRes.data : null;
    let isProvider = profile && (profile.role === 'provider' || profile.role === 'pending_provider');
    let displayName = (profile && (profile.business_name || profile.full_name)) || userEmail || 'there';

    await _deleteSharedTables(supabase, userId);
    if (isProvider) {
      await _deleteProviderTables(supabase, userId);
    } else {
      await _deleteMemberTables(supabase, userId);
    }
    await _deleteAuthAndNotify(
      Object.assign({}, opts, { requestId: requestId, source: source, sendEmail: sendEmail }),
      displayName
    );

    console.log('[' + requestId + '] Account deletion completed for user ' + userId);
    return { success: true };
  } catch (error) {
    console.error('[' + requestId + '] Account deletion error:', error);
    return {
      success: false,
      statusCode: 500,
      error: (error && error.message) ? error.message : 'Failed to delete account. Please try again or contact support.'
    };
  }
}

function buildDeletionEmailHtml(displayName, source) {
  let reasonClause = source === 'facebook_callback'
    ? ' because you removed the My Car Concierge app from your Facebook account'
    : ' as requested';
  return ''
    + '<div style="font-family: \'Outfit\', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #fefdfb;">'
    +   '<div style="text-align: center; margin-bottom: 30px;">'
    +     '<img src="https://mycarconcierge.com/icons/mcc-logo-full.png" alt="My Car Concierge" style="height: 50px;">'
    +   '</div>'
    +   '<h1 style="color: #1e3a5f; font-size: 24px; margin-bottom: 20px;">Account Deleted</h1>'
    +   '<p style="color: #4b5563; line-height: 1.6;">Hello ' + escapeHtml(displayName) + ',</p>'
    +   '<p style="color: #4b5563; line-height: 1.6;">Your My Car Concierge account has been permanently deleted' + reasonClause + '. All your personal data has been removed from our systems.</p>'
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

module.exports = { performAccountDeletion: performAccountDeletion };
